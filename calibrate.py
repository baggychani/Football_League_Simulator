#!/usr/bin/env python3
"""Build and open the browser-based Polymarket calibration lab."""
from __future__ import annotations

import argparse
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 27184


def wait_for_server(url: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.2)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the Polymarket calibration lab")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    npm = "npm.cmd" if os.name == "nt" else "npm"
    if not args.skip_build:
        subprocess.run([npm, "run", "build"], cwd=ROOT, check=True)

    environment = os.environ.copy()
    environment["CALIBRATE_PORT"] = str(args.port)
    server = subprocess.Popen([npm, "run", "calibrate:serve"], cwd=ROOT, env=environment)
    url = f"http://127.0.0.1:{args.port}/"
    if not wait_for_server(f"{url}api/health"):
        server.terminate()
        raise SystemExit("보정 서버가 시작되지 않았습니다.")

    print(f"\nCalibration lab: {url}")
    print("브라우저에서 보정 시작을 누르세요. Ctrl+C로 종료합니다.\n")
    if not args.no_browser:
        threading.Timer(0.3, lambda: webbrowser.open_new_tab(url)).start()

    try:
        server.wait()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
