#!/usr/bin/env python3
"""
Fetch WARN Act layoff data.

Strategy: Use layoffdata.com bulk downloads (no API key needed) as primary.
WARN Firehose API as optional enhancement if we get a key later.

For MVP: scrape the layoffdata.com aggregate stats page.
Fallback: use BLS Mass Layoff Statistics via FRED.

Usage:
    python3 fetch_warn.py
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# FRED series for mass layoff proxy data
# These are available without WARN-specific API keys
WARN_PROXY_SERIES = {
    "ICSA": {
        "name": "Initial Claims (Unemployment Insurance)",
        "frequency": "weekly",
        "unit": "number",
        "note": "Weekly initial jobless claims — best high-frequency proxy for layoffs",
    },
    "CCSA": {
        "name": "Continued Claims (Insured Unemployment)",
        "frequency": "weekly",
        "unit": "number",
        "note": "People still receiving unemployment insurance",
    },
}

FRED_API_KEY = None

def try_load_fred_key():
    """Try to load FRED API key from env or secrets file."""
    import os
    global FRED_API_KEY
    FRED_API_KEY = os.environ.get("FRED_API_KEY")
    if not FRED_API_KEY:
        key_file = Path(__file__).parent.parent / "secrets" / "fred-api-key.txt"
        if key_file.exists():
            FRED_API_KEY = key_file.read_text().strip()
    return FRED_API_KEY


def fetch_fred_series(series_id: str, observation_start: str = "2020-01-01") -> list[dict]:
    """Fetch a single FRED series (reusable from fetch_fred.py logic)."""
    if not FRED_API_KEY:
        return []

    url = (
        f"https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={FRED_API_KEY}"
        f"&file_type=json&observation_start={observation_start}&sort_order=asc"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DisplacementIndex/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return [
                {"date": obs["date"], "value": float(obs["value"])}
                for obs in data.get("observations", [])
                if obs.get("value") and obs["value"] != "."
            ]
    except Exception as e:
        print(f"  ERROR fetching {series_id}: {e}", file=sys.stderr)
        return []


def fetch_layoff_claims() -> dict:
    """Fetch initial + continued claims from FRED as layoff proxy."""
    result = {
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "source": "FRED (BLS via DOL)",
        "series": {},
    }

    for series_id, meta in WARN_PROXY_SERIES.items():
        print(f"  Fetching {series_id} ({meta['name']})...")
        observations = fetch_fred_series(series_id)
        result["series"][series_id] = {
            **meta,
            "series_id": series_id,
            "observations": observations,
            "latest": observations[-1] if observations else None,
            "count": len(observations),
        }

    return result


def main():
    try_load_fred_key()

    if not FRED_API_KEY:
        print("WARNING: No FRED_API_KEY — can't fetch claims data.", file=sys.stderr)
        print("  Set FRED_API_KEY env var or put key in secrets/fred-api-key.txt", file=sys.stderr)
        sys.exit(1)

    print("Fetching layoff proxy data (initial + continued claims)...")
    data = fetch_layoff_claims()

    out_path = DATA_DIR / "warn_raw.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Written to {out_path}")

    for series_id, series_data in data["series"].items():
        latest = series_data.get("latest")
        latest_str = f"{latest['date']}: {latest['value']:,.0f}" if latest else "NO DATA"
        print(f"  {series_id}: {series_data['count']} obs, latest = {latest_str}")


if __name__ == "__main__":
    main()
