#!/usr/bin/env python3
"""Build and serve Premier League ∞ on a deliberately non-default local port."""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import threading
import tempfile
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
DATA = ROOT / "src" / "data"
RATINGS = DATA / "calibrated-ratings.json"
MARKET = DATA / "default-market.json"
META = DATA / "polymarket-meta.json"
DEFAULT_PORT = 27183
MAX_BODY_BYTES = 2 * 1024 * 1024
LOCAL_API_HEADER = "X-Football-Local-Api"
LOCAL_API_HEADER_VALUE = "1"
WRITE_LOCK = threading.Lock()


def stamped_ratings_name() -> str:
    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return f"calibrated-ratings_{stamp}.json"


def run_market_update() -> dict:
    npm = "npm.cmd" if os.name == "nt" else "npm"
    completed = subprocess.run(
        [npm, "run", "market:update"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "market update failed").strip()
        raise RuntimeError(detail)
    market = json.loads(MARKET.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    total = sum(float(value) for value in market.values())
    if total <= 0:
        raise RuntimeError("Market total must be positive.")
    target = {team_id: float(value) / total for team_id, value in market.items()}
    return {
        "ok": True,
        "persisted": True,
        "market": market,
        "target": target,
        "meta": meta,
        "changedTeams": meta.get("changedTeams", []),
    }


def validate_market(market: object) -> dict[str, float]:
    if not isinstance(market, dict):
        raise ValueError("Expected market object.")
    expected_ids = set(json.loads(MARKET.read_text(encoding="utf-8")).keys())
    if set(market) != expected_ids:
        raise ValueError("Market must contain exactly the known team IDs.")
    values: dict[str, float] = {}
    for team_id, value in market.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"Invalid market price for {team_id}.")
        values[team_id] = float(value)
    if sum(values.values()) <= 0:
        raise ValueError("Market total must be positive.")
    return values


def validate_calibration(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Calibration payload must be an object.")
    if payload.get("schemaVersion") != 2 or payload.get("calibrationMode") != "static-baseline":
        raise ValueError("Unsupported calibration payload.")
    ratings = payload.get("ratings")
    if not isinstance(ratings, dict):
        raise ValueError("Missing calibrated ratings.")
    expected_ids = set(json.loads(MARKET.read_text(encoding="utf-8")).keys())
    if set(ratings) != expected_ids:
        raise ValueError("Ratings must contain exactly the known team IDs.")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in ratings.values()):
        raise ValueError("Ratings must be finite numbers.")
    if not isinstance(payload.get("teamDiagnostics"), dict):
        raise ValueError("Missing team calibration diagnostics.")
    return payload


def validate_meta(meta: object) -> dict:
    if not isinstance(meta, dict):
        raise ValueError("Expected meta object.")
    for field in ("slug", "title", "fetchedAt", "source"):
        if not isinstance(meta.get(field), str) or not meta[field]:
            raise ValueError(f"meta.{field} must be a non-empty string.")
    for field in ("matchedTeams", "unmatchedPolymarket", "missingTeams", "changedTeams"):
        value = meta.get(field)
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise ValueError(f"meta.{field} must be an array of strings.")
    return meta


def atomic_write(path: Path, data: bytes) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        requested = DIST / path.lstrip("/")
        if path != "/" and not requested.exists():
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if self.headers.get(LOCAL_API_HEADER) != LOCAL_API_HEADER_VALUE:
            self.send_json_error(403, "Missing local API header.")
            return

        if path != "/api/update-market":
            try:
                body = self.read_json_body()
            except ValueError as error:
                self.send_json_error(400, str(error))
                return

        if path == "/api/update-market":
            try:
                payload = json.dumps(run_market_update())
            except subprocess.TimeoutExpired:
                self.send_json_error(504, "Market update timed out.")
                return
            except Exception as error:
                self.send_json_error(502, str(error))
                return
            self.send_json(200, json.loads(payload))
            print("updated market from Polymarket")
            return

        if path == "/api/save-market":
            try:
                market = validate_market(body["market"])
                meta = validate_meta(body["meta"])
                total = sum(float(value) for value in market.values())
                target = {team_id: float(value) / total for team_id, value in market.items()}
                with WRITE_LOCK:
                    atomic_write(MARKET, (json.dumps(market, indent=2) + "\n").encode("utf-8"))
                    atomic_write(META, (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
                response = {
                    "ok": True,
                    "persisted": True,
                    "market": market,
                    "target": target,
                    "meta": meta,
                    "changedTeams": meta.get("changedTeams", []),
                }
            except Exception as error:
                self.send_json_error(400, str(error))
                return
            self.send_json(200, response)
            print("saved market snapshot from client")
            return

        if path != "/api/save-calibration":
            self.send_error(404)
            return
        try:
            payload = validate_calibration(body)
            encoded = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
            stamped = DATA / stamped_ratings_name()
            with WRITE_LOCK:
                atomic_write(RATINGS, encoded)
                atomic_write(stamped, encoded)
        except Exception as error:
            self.send_json_error(400, str(error))
            return
        response = {"ok": True, "path": "src/data/calibrated-ratings.json", "stamped": f"src/data/{stamped.name}"}
        self.send_json(200, response)
        print(f"saved {RATINGS}")
        print(f"saved {stamped}")

    def read_json_body(self) -> object:
        content_type = self.headers.get("Content-Type", "")
        if content_type and not content_type.lower().startswith("application/json"):
            raise ValueError("Content-Type must be application/json.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid Content-Length.") from error
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError(f"Request body exceeds {MAX_BODY_BYTES} bytes.")
        try:
            body = self.rfile.read(length)
            return json.loads(body.decode("utf-8"))
        except TimeoutError as error:
            raise ValueError("Request body timed out.") from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Request body must be valid JSON.") from error

    def send_json(self, status: int, payload: object) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def send_json_error(self, status: int, message: str) -> None:
        self.send_json(status, {"ok": False, "error": message})


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and launch the simulator")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--no-browser", action="store_true", help="Serve without opening a browser tab")
    args = parser.parse_args()
    if not args.skip_build:
        npm = "npm.cmd" if os.name == "nt" else "npm"
        subprocess.run([npm, "run", "build"], cwd=ROOT, check=True)
    if not DIST.exists():
        raise SystemExit("dist/ is missing. Run without --skip-build first.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SpaHandler)
    url = f"http://127.0.0.1:{args.port}"
    print(f"\nPremier League ∞ is live: {url}")
    print(f"Calibration lab: {url}/calibrate.html")
    print("Press Ctrl+C to stop.\n")
    if not args.no_browser:
        threading.Timer(0.25, lambda: webbrowser.open_new_tab(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
