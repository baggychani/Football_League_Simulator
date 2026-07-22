#!/usr/bin/env python3
"""Build and serve Premier League ∞ on a deliberately non-default local port."""
from __future__ import annotations

import argparse
import os
import subprocess
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
DATA = ROOT / "src" / "data"
RATINGS = DATA / "calibrated-ratings.json"
DEFAULT_PORT = 27183


def stamped_ratings_name() -> str:
    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return f"calibrated-ratings_{stamp}.json"


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

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
        if path != "/api/save-calibration":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            import json

            json.loads(body.decode("utf-8"))
            RATINGS.write_bytes(body)
            stamped = DATA / stamped_ratings_name()
            stamped.write_bytes(body)
        except Exception as error:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(str(error).encode("utf-8"))
            return
        payload = json.dumps({"ok": True, "path": "src/data/calibrated-ratings.json", "stamped": f"src/data/{stamped.name}"})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(payload.encode("utf-8"))
        print(f"saved {RATINGS}")
        print(f"saved {stamped}")


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
