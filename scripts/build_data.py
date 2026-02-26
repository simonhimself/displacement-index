#!/usr/bin/env python3
"""
Orchestrator: runs all data fetchers and computes derived indicators.

Usage:
    export FRED_API_KEY=your_key
    python3 build_data.py

Or with key file:
    echo "your_key" > ../secrets/fred-api-key.txt
    python3 build_data.py
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SECRETS_DIR = PROJECT_DIR / "secrets"


def load_env():
    """Load FRED API key from env or secrets file."""
    if not os.environ.get("FRED_API_KEY"):
        key_file = SECRETS_DIR / "fred-api-key.txt"
        if key_file.exists():
            os.environ["FRED_API_KEY"] = key_file.read_text().strip()
            print(f"Loaded FRED_API_KEY from {key_file}")
        else:
            print(f"ERROR: No FRED_API_KEY. Set env var or create {key_file}", file=sys.stderr)
            sys.exit(1)


def run_script(name: str) -> bool:
    """Run a Python script and return success status."""
    script_path = SCRIPT_DIR / name
    print(f"\n{'='*60}")
    print(f"Running {name}...")
    print(f"{'='*60}")

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(SCRIPT_DIR),
        env=os.environ.copy(),
    )

    if result.returncode != 0:
        print(f"FAILED: {name} exited with code {result.returncode}", file=sys.stderr)
        return False
    return True


def main():
    start = datetime.now()
    print(f"The Displacement Index — Data Build")
    print(f"Started: {start.isoformat()}")

    load_env()

    # Step 1: Fetch FRED data
    if not run_script("fetch_fred.py"):
        sys.exit(1)

    # Step 2: Fetch WARN/layoff proxy data
    if not run_script("fetch_warn.py"):
        print("WARNING: WARN data fetch failed, continuing with FRED only...")

    # Step 2b: Fetch Indeed job postings data
    if not run_script("fetch_indeed.py"):
        print("WARNING: Indeed data fetch failed, continuing without it...")

    # Step 3: Compute derived indicators
    if not run_script("compute_derived.py"):
        sys.exit(1)

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n{'='*60}")
    print(f"BUILD COMPLETE in {elapsed:.1f}s")
    print(f"Output: data/indicators.json")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
