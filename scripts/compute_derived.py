#!/usr/bin/env python3
"""
Compute derived indicators for The Displacement Index.

Reads fred_raw.json + warn_raw.json, computes:
1. Ghost GDP Score (productivity growth vs wage growth divergence)
2. Displacement Velocity (white-collar unemployment rate of change vs overall)
3. Chain Link Status (normal / elevated / warning / critical for each link)
4. Composite Displacement Index score

Outputs: indicators.json

Usage:
    python3 compute_derived.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename: str) -> dict:
    path = DATA_DIR / filename
    if not path.exists():
        print(f"ERROR: {path} not found. Run fetch scripts first.", file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def get_series(fred_data: dict, series_id: str) -> list[dict]:
    """Extract observations for a series from fred_raw.json."""
    for chain_link, series_map in fred_data.get("chain_links", {}).items():
        if series_id in series_map:
            return series_map[series_id].get("observations", [])
    return []


def get_latest(fred_data: dict, series_id: str) -> dict | None:
    """Get latest observation for a series."""
    obs = get_series(fred_data, series_id)
    return obs[-1] if obs else None


def pct_change(series: list[dict], periods: int = 1) -> float | None:
    """Calculate percent change over N periods from end of series."""
    if len(series) < periods + 1:
        return None
    current = series[-1]["value"]
    previous = series[-(periods + 1)]["value"]
    if previous == 0:
        return None
    return ((current - previous) / abs(previous)) * 100


def yoy_change(series: list[dict], frequency: str = "monthly") -> float | None:
    """Calculate year-over-year change."""
    periods = {"monthly": 12, "quarterly": 4, "weekly": 52, "daily": 252}.get(frequency, 12)
    return pct_change(series, periods)


def z_score_vs_history(series: list[dict], lookback: int = 60) -> float | None:
    """How many std devs is current value from recent mean."""
    if len(series) < max(lookback, 10):
        lookback = len(series)
    if lookback < 5:
        return None

    values = [obs["value"] for obs in series[-lookback:]]
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = variance ** 0.5

    if std == 0:
        return 0.0

    current = series[-1]["value"]
    return (current - mean) / std


def classify_status(z_score: float | None, inverted: bool = False) -> str:
    """
    Classify indicator status based on z-score.
    inverted=True means higher values are BETTER (e.g., consumer sentiment, employment level).
    """
    if z_score is None:
        return "unknown"

    if inverted:
        z_score = -z_score

    if z_score >= 2.0:
        return "critical"
    elif z_score >= 1.0:
        return "warning"
    elif z_score >= 0.5:
        return "elevated"
    else:
        return "normal"


def compute_ghost_gdp(fred_data: dict) -> dict:
    """
    Ghost GDP = productivity rising while wages stagnate/fall.
    Score = productivity YoY change minus real wage YoY change.
    Positive = ghost GDP (output growing faster than wages).
    """
    productivity = get_series(fred_data, "OPHNFB")
    wages = get_series(fred_data, "LES1252881600Q")

    prod_yoy = yoy_change(productivity, "quarterly")
    wage_yoy = yoy_change(wages, "quarterly")

    ghost_score = None
    if prod_yoy is not None and wage_yoy is not None:
        ghost_score = prod_yoy - wage_yoy

    return {
        "name": "Ghost GDP Score",
        "description": "Productivity growth minus real wage growth. Positive = output not reaching workers.",
        "value": round(ghost_score, 2) if ghost_score is not None else None,
        "components": {
            "productivity_yoy_pct": round(prod_yoy, 2) if prod_yoy is not None else None,
            "real_wage_yoy_pct": round(wage_yoy, 2) if wage_yoy is not None else None,
        },
        "status": classify_status(ghost_score / 2 if ghost_score else None),  # Rough scaling
    }


def compute_displacement_velocity(fred_data: dict) -> dict:
    """
    How fast is white-collar unemployment rising vs overall?
    Ratio of white-collar unemployment change to overall unemployment change.
    """
    prof_biz = get_series(fred_data, "LNU04032239")
    info = get_series(fred_data, "LNU04032237")
    overall = get_series(fred_data, "UNRATE")

    prof_change = pct_change(prof_biz, 3) if len(prof_biz) >= 4 else None  # 3-month change
    info_change = pct_change(info, 3) if len(info) >= 4 else None
    overall_change = pct_change(overall, 3) if len(overall) >= 4 else None

    # Average white-collar change
    wc_changes = [c for c in [prof_change, info_change] if c is not None]
    avg_wc_change = sum(wc_changes) / len(wc_changes) if wc_changes else None

    velocity = None
    if avg_wc_change is not None and overall_change is not None and overall_change != 0:
        velocity = avg_wc_change / abs(overall_change)

    return {
        "name": "Displacement Velocity",
        "description": "White-collar unemployment change relative to overall. >1 = white-collar deteriorating faster.",
        "value": round(velocity, 2) if velocity is not None else None,
        "components": {
            "prof_biz_3mo_change_pct": round(prof_change, 2) if prof_change is not None else None,
            "info_3mo_change_pct": round(info_change, 2) if info_change is not None else None,
            "overall_3mo_change_pct": round(overall_change, 2) if overall_change is not None else None,
        },
        "status": classify_status(
            (velocity - 1.0) if velocity is not None else None
        ),
    }


def compute_chain_link_status(fred_data: dict, warn_data: dict) -> dict:
    """Compute status for each of the 5 chain links."""

    links = {}

    # Link 1: White-Collar Displacement
    prof_z = z_score_vs_history(get_series(fred_data, "LNU04032239"))
    info_z = z_score_vs_history(get_series(fred_data, "LNU04032237"))
    emp_z = z_score_vs_history(get_series(fred_data, "CES6054000001"))

    z_scores_1 = [z for z in [prof_z, info_z] if z is not None]
    # Employment is inverted (lower = worse)
    if emp_z is not None:
        z_scores_1.append(-emp_z)
    avg_z_1 = sum(z_scores_1) / len(z_scores_1) if z_scores_1 else None

    links["displacement"] = {
        "name": "White-Collar Displacement",
        "status": classify_status(avg_z_1),
        "z_score": round(avg_z_1, 2) if avg_z_1 is not None else None,
        "indicators": {
            "LNU04032239": {"z": round(prof_z, 2) if prof_z else None, "status": classify_status(prof_z)},
            "LNU04032237": {"z": round(info_z, 2) if info_z else None, "status": classify_status(info_z)},
            "CES6054000001": {"z": round(emp_z, 2) if emp_z else None, "status": classify_status(emp_z, inverted=True)},
        },
    }

    # Link 2: Consumer Spending
    pce_z = z_score_vs_history(get_series(fred_data, "PCEC96"))
    sent_z = z_score_vs_history(get_series(fred_data, "UMCSENT"))
    retail_z = z_score_vs_history(get_series(fred_data, "RSAFS"))

    # These are inverted — lower values = worse
    z_scores_2 = [z for z in [pce_z, sent_z, retail_z] if z is not None]
    avg_z_2 = -sum(z_scores_2) / len(z_scores_2) if z_scores_2 else None

    links["spending"] = {
        "name": "Consumer Spending",
        "status": classify_status(avg_z_2),
        "z_score": round(avg_z_2, 2) if avg_z_2 is not None else None,
        "indicators": {
            "PCEC96": {"z": round(pce_z, 2) if pce_z else None, "status": classify_status(pce_z, inverted=True)},
            "UMCSENT": {"z": round(sent_z, 2) if sent_z else None, "status": classify_status(sent_z, inverted=True)},
            "RSAFS": {"z": round(retail_z, 2) if retail_z else None, "status": classify_status(retail_z, inverted=True)},
        },
    }

    # Link 3: Ghost GDP
    m2v_z = z_score_vs_history(get_series(fred_data, "M2V"))
    # M2V declining = bad (inverted)
    links["ghost_gdp"] = {
        "name": "Ghost GDP",
        "status": classify_status(-m2v_z if m2v_z else None),
        "z_score": round(-m2v_z, 2) if m2v_z is not None else None,
        "indicators": {
            "M2V": {"z": round(m2v_z, 2) if m2v_z else None, "status": classify_status(m2v_z, inverted=True)},
        },
    }

    # Link 4: Credit Stress
    hy_z = z_score_vs_history(get_series(fred_data, "BAMLH0A0HYM2"))
    ccc_z = z_score_vs_history(get_series(fred_data, "BAMLH0A3HYC"))
    delinq_z = z_score_vs_history(get_series(fred_data, "DRCLACBS"))

    z_scores_4 = [z for z in [hy_z, ccc_z, delinq_z] if z is not None]
    avg_z_4 = sum(z_scores_4) / len(z_scores_4) if z_scores_4 else None

    links["credit_stress"] = {
        "name": "Credit Stress",
        "status": classify_status(avg_z_4),
        "z_score": round(avg_z_4, 2) if avg_z_4 is not None else None,
        "indicators": {
            "BAMLH0A0HYM2": {"z": round(hy_z, 2) if hy_z else None, "status": classify_status(hy_z)},
            "BAMLH0A3HYC": {"z": round(ccc_z, 2) if ccc_z else None, "status": classify_status(ccc_z)},
            "DRCLACBS": {"z": round(delinq_z, 2) if delinq_z else None, "status": classify_status(delinq_z)},
        },
    }

    # Link 5: Mortgage Stress
    mort_z = z_score_vs_history(get_series(fred_data, "DRSFRMACBS"))
    links["mortgage_stress"] = {
        "name": "Mortgage & Housing Stress",
        "status": classify_status(mort_z),
        "z_score": round(mort_z, 2) if mort_z is not None else None,
        "indicators": {
            "DRSFRMACBS": {"z": round(mort_z, 2) if mort_z else None, "status": classify_status(mort_z)},
        },
    }

    return links


def compute_composite_index(chain_links: dict) -> dict:
    """
    Composite Displacement Index: 0-100 scale.
    Based on chain link statuses.
    """
    status_scores = {"normal": 0, "elevated": 25, "warning": 50, "critical": 100, "unknown": 0}

    scores = []
    for link_id, link_data in chain_links.items():
        scores.append(status_scores.get(link_data["status"], 0))

    composite = sum(scores) / len(scores) if scores else 0

    # Count links in each status
    status_counts = {}
    for link_data in chain_links.values():
        s = link_data["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    return {
        "value": round(composite, 1),
        "scale": "0-100 (0=all normal, 100=all critical)",
        "chain_link_statuses": status_counts,
        "interpretation": _interpret_composite(composite),
    }


def _interpret_composite(score: float) -> str:
    if score >= 75:
        return "Critical: Multiple chain links showing severe stress"
    elif score >= 50:
        return "Warning: Significant stress in the displacement chain"
    elif score >= 25:
        return "Elevated: Early signals present in some chain links"
    else:
        return "Normal: No significant displacement signals detected"


def main():
    print("Loading raw data...")
    fred_data = load_json("fred_raw.json")
    warn_data = load_json("warn_raw.json") if (DATA_DIR / "warn_raw.json").exists() else {}

    print("Computing derived indicators...")
    ghost_gdp = compute_ghost_gdp(fred_data)
    print(f"  Ghost GDP Score: {ghost_gdp['value']} ({ghost_gdp['status']})")

    displacement_velocity = compute_displacement_velocity(fred_data)
    print(f"  Displacement Velocity: {displacement_velocity['value']} ({displacement_velocity['status']})")

    print("Computing chain link statuses...")
    chain_links = compute_chain_link_status(fred_data, warn_data)
    for link_id, link_data in chain_links.items():
        print(f"  {link_data['name']}: {link_data['status']} (z={link_data['z_score']})")

    print("Computing composite index...")
    composite = compute_composite_index(chain_links)
    print(f"  Displacement Index: {composite['value']}/100 — {composite['interpretation']}")

    # Build final output
    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "fred_fetched_at": fred_data.get("fetched_at"),
        "composite_index": composite,
        "derived_indicators": {
            "ghost_gdp": ghost_gdp,
            "displacement_velocity": displacement_velocity,
        },
        "chain_links": chain_links,
    }

    out_path = DATA_DIR / "indicators.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nWritten to {out_path}")


if __name__ == "__main__":
    main()
