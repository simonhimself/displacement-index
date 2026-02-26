#!/usr/bin/env python3
"""
Fetch Indeed Hiring Lab job postings data (free, public, CC-BY-4.0).

Source: https://github.com/hiring-lab/job_postings_tracker
- Aggregate US postings index (daily, SA)
- Sector-level postings for key white-collar sectors

Outputs: data/indeed_raw.json
"""

import csv
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

BASE_URL = "https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/US"

# Sectors relevant to displacement thesis
TARGET_SECTORS = [
    "Software Development",
    "Information Design & Documentation",
    "Mathematics",
    "Banking & Finance",
    "Accounting",
    "Marketing",
    "Media & Communications",
]


def fetch_csv(url: str) -> list[dict]:
    """Fetch and parse a CSV from URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DisplacementIndex/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(text))
            return list(reader)
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}", file=sys.stderr)
        return []


def process_aggregate(rows: list[dict]) -> dict:
    """Process aggregate US job postings index."""
    observations = []
    for row in rows:
        date = row.get("date", "")
        value = row.get("indeed_job_postings_index_SA") or row.get("indeed_job_postings_index")
        if date and value:
            try:
                observations.append({"date": date, "value": float(value)})
            except ValueError:
                continue

    # Keep last 2 years (daily data is huge)
    if len(observations) > 730:
        observations = observations[-730:]

    return {
        "name": "Indeed Job Postings Index (SA)",
        "frequency": "daily",
        "unit": "index_feb2020_100",
        "note": "Seasonally adjusted. 100 = Feb 1, 2020 baseline.",
        "observations": observations,
        "latest": observations[-1] if observations else None,
        "count": len(observations),
    }


def process_sectors(rows: list[dict]) -> dict:
    """Process sector-level postings, filtering to target sectors."""
    sectors = {}

    for row in rows:
        sector = row.get("display_name", "")
        variable = row.get("variable", "")
        if sector not in TARGET_SECTORS:
            continue
        if variable != "total postings":
            continue

        date = row.get("date", "")
        value = row.get("indeed_job_postings_index")
        if not date or not value:
            continue

        try:
            val = float(value)
        except ValueError:
            continue

        if sector not in sectors:
            sectors[sector] = []
        sectors[sector].append({"date": date, "value": val})

    result = {}
    for sector, obs in sectors.items():
        # Keep last 2 years
        if len(obs) > 730:
            obs = obs[-730:]
        result[sector] = {
            "name": f"Indeed Postings: {sector}",
            "frequency": "daily",
            "unit": "index_feb2020_100",
            "observations": obs,
            "latest": obs[-1] if obs else None,
            "count": len(obs),
        }

    return result


def main():
    print("Fetching Indeed Hiring Lab data...")

    # Aggregate
    print("  Fetching aggregate US postings...")
    agg_rows = fetch_csv(f"{BASE_URL}/aggregate_job_postings_US.csv")
    aggregate = process_aggregate(agg_rows)
    print(f"  Aggregate: {aggregate['count']} obs, latest = {aggregate.get('latest', {}).get('date', 'N/A')}: {aggregate.get('latest', {}).get('value', 'N/A')}")

    # Sectors
    print("  Fetching sector-level postings...")
    sector_rows = fetch_csv(f"{BASE_URL}/job_postings_by_sector_US.csv")
    sectors = process_sectors(sector_rows)
    for name, data in sectors.items():
        print(f"  {name}: {data['count']} obs, latest = {data.get('latest', {}).get('value', 'N/A')}")

    result = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "Indeed Hiring Lab (CC-BY-4.0)",
        "attribution": "Indeed Hiring Lab, https://github.com/hiring-lab/job_postings_tracker",
        "aggregate": aggregate,
        "sectors": sectors,
    }

    out_path = DATA_DIR / "indeed_raw.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nWritten to {out_path}")


if __name__ == "__main__":
    main()
