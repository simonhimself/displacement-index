#!/usr/bin/env python3
"""
Fetch all FRED series for The Displacement Index.
Outputs individual JSON files per series + a combined indicators.json

Usage:
    export FRED_API_KEY=your_key
    python3 fetch_fred.py
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

API_KEY = os.environ.get("FRED_API_KEY")
BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# All FRED series we track, grouped by chain link
SERIES = {
    # Chain Link 1: White-Collar Displacement
    "displacement": {
        "LNU04032239": {
            "name": "Unemployment Rate: Professional & Business Services",
            "frequency": "monthly",
            "unit": "percent",
        },
        "LNU04032237": {
            "name": "Unemployment Rate: Information Industry",
            "frequency": "monthly",
            "unit": "percent",
        },
        "CES6054000001": {
            "name": "Employees: Professional, Scientific & Technical Services",
            "frequency": "monthly",
            "unit": "thousands",
        },
        "UNRATE": {
            "name": "Overall Unemployment Rate",
            "frequency": "monthly",
            "unit": "percent",
            "note": "Baseline comparator for white-collar vs overall",
        },
    },
    # Chain Link 2: Consumer Spending
    "spending": {
        "PCEC96": {
            "name": "Real Personal Consumption Expenditures",
            "frequency": "monthly",
            "unit": "billions_2017_dollars",
        },
        "UMCSENT": {
            "name": "Consumer Sentiment (UMich)",
            "frequency": "monthly",
            "unit": "index_1966q1_100",
        },
        "RSAFS": {
            "name": "Advance Retail Sales: Retail and Food Services",
            "frequency": "monthly",
            "unit": "millions_dollars",
        },
    },
    # Chain Link 3: Ghost GDP (Productivity vs Wages divergence)
    "ghost_gdp": {
        "OPHNFB": {
            "name": "Nonfarm Business Sector: Real Output Per Hour",
            "frequency": "quarterly",
            "unit": "index_2017_100",
        },
        "LES1252881600Q": {
            "name": "Median Usual Weekly Real Earnings",
            "frequency": "quarterly",
            "unit": "2025_dollars",
        },
        "M2V": {
            "name": "Velocity of M2 Money Stock",
            "frequency": "quarterly",
            "unit": "ratio",
        },
    },
    # Chain Link 4: Credit Stress
    "credit_stress": {
        "BAMLH0A0HYM2": {
            "name": "ICE BofA US High Yield Index OAS",
            "frequency": "daily",
            "unit": "percent",
        },
        "BAMLH0A3HYC": {
            "name": "ICE BofA CCC & Lower US High Yield Index OAS",
            "frequency": "daily",
            "unit": "percent",
        },
        "DRCLACBS": {
            "name": "Delinquency Rate on Consumer Loans",
            "frequency": "quarterly",
            "unit": "percent",
        },
    },
    # Chain Link 5: Mortgage / Housing Stress
    "mortgage_stress": {
        "DRSFRMACBS": {
            "name": "Delinquency Rate: Single-Family Residential Mortgages",
            "frequency": "quarterly",
            "unit": "percent",
        },
    },
    # Context Indicators (not scored — provide balance and context)
    "context": {
        "BABATOTALSAUS": {
            "name": "New Business Applications (Total)",
            "frequency": "monthly",
            "unit": "applications",
            "note": "Rising = entrepreneurial dynamism. Falling = creative destruction failing.",
        },
        "USCONS": {
            "name": "Construction Employment",
            "frequency": "monthly",
            "unit": "thousands",
            "note": "AI capex is driving data center construction hiring. Tracks whether AI creates offsetting jobs.",
        },
        "JTSJOL": {
            "name": "Job Openings (JOLTS)",
            "frequency": "monthly",
            "unit": "thousands",
            "note": "Total labor demand. Falling openings = weakening demand for workers.",
        },
    },
}


def fetch_series(series_id: str, observation_start: str = None) -> list[dict]:
    """Fetch observations for a single FRED series."""
    if not observation_start:
        # Default: 5 years of history for context
        observation_start = (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")

    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }

    url = BASE_URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DisplacementIndex/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            observations = data.get("observations", [])
            # Clean: remove entries with "." value (FRED uses "." for missing)
            return [
                {"date": obs["date"], "value": float(obs["value"])}
                for obs in observations
                if obs.get("value") and obs["value"] != "."
            ]
    except urllib.error.HTTPError as e:
        print(f"  ERROR fetching {series_id}: HTTP {e.code} - {e.reason}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"  ERROR fetching {series_id}: {e}", file=sys.stderr)
        return []


def fetch_all() -> dict:
    """Fetch all series, return structured data."""
    result = {
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "chain_links": {},
    }

    total_series = sum(len(s) for s in SERIES.values())
    fetched = 0

    for chain_link, series_map in SERIES.items():
        result["chain_links"][chain_link] = {}

        for series_id, meta in series_map.items():
            fetched += 1
            print(f"[{fetched}/{total_series}] Fetching {series_id} ({meta['name']})...")

            observations = fetch_series(series_id)

            result["chain_links"][chain_link][series_id] = {
                **meta,
                "series_id": series_id,
                "observations": observations,
                "latest": observations[-1] if observations else None,
                "count": len(observations),
            }

            # Respect FRED rate limit (120 req/min, but be polite)
            time.sleep(0.6)

    return result


def main():
    if not API_KEY:
        print("ERROR: Set FRED_API_KEY environment variable", file=sys.stderr)
        print("  Register free at: https://fredaccount.stlouisfed.org/apikeys", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching FRED data...")
    data = fetch_all()

    # Write combined file
    out_path = DATA_DIR / "fred_raw.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\nWritten to {out_path}")

    # Summary
    total_obs = 0
    for chain_link, series_map in data["chain_links"].items():
        for series_id, series_data in series_map.items():
            count = series_data["count"]
            latest = series_data.get("latest")
            latest_str = f"{latest['date']}: {latest['value']}" if latest else "NO DATA"
            print(f"  {series_id}: {count} obs, latest = {latest_str}")
            total_obs += count

    print(f"\nTotal: {total_obs} observations across {sum(len(s) for s in SERIES.values())} series")


if __name__ == "__main__":
    main()
