#!/usr/bin/env python3
"""Fetch latest EPL champion Yes prices from Polymarket and update default-market.json."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Update market prices from Polymarket")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing files")
    parser.add_argument(
        "--slug",
        default="epl-2027-champion-20260701200428749",
        help="Polymarket event slug",
    )
    args = parser.parse_args()

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    command = [npm, "run", "market:update", "--", f"--slug={args.slug}"]
    if args.dry_run:
        command.append("--dry-run")

    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
