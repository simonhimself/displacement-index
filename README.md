# The Displacement Index

**Is AI prosperity reaching the real economy?**

A data-driven dashboard tracking whether AI-driven productivity gains are translating into broad prosperity — or hollowing out the economy through white-collar displacement, spending collapse, and credit stress.

## The Displacement Chain

We track five linked economic signals that would activate in sequence if AI-driven displacement is unfolding:

1. **White-Collar Displacement** — Professional & technical sector unemployment
2. **Consumer Spending** — Real consumption, sentiment & retail sales
3. **Ghost GDP** — Productivity growing faster than wages (output not reaching workers)
4. **Credit Stress** — High-yield spreads & consumer delinquencies
5. **Mortgage Stress** — Residential mortgage delinquencies

Plus context indicators: job postings by sector (Indeed), new business formation, construction employment, and JOLTS job openings.

## Data Sources

All data is from free, public sources:

| Source | Data | Frequency |
|--------|------|-----------|
| [FRED](https://fred.stlouisfed.org/) | 17 economic series (employment, spending, credit, housing) | Daily to quarterly |
| [Indeed Hiring Lab](https://github.com/hiring-lab/job_postings_tracker) | Job postings by sector (CC-BY-4.0) | Daily |
| [BLS](https://www.bls.gov/) | Employment & labor market data (via FRED) | Monthly |

## Methodology

Each chain link is scored using z-scores against 5-year historical distributions:
- **Normal**: < 0.5σ
- **Elevated**: 0.5–1.0σ  
- **Warning**: 1.0–2.0σ
- **Critical**: > 2.0σ

The composite Displacement Index maps the average chain link severity to a 0–100 scale.

## Project Structure

```
├── site/              # Static website (HTML/CSS/JS)
│   ├── index.html     # Main dashboard
│   ├── css/style.css  # Styles
│   └── js/app.js      # Data rendering + charts
├── scripts/           # Data pipeline
│   ├── build_data.py  # Orchestrator (run this)
│   ├── fetch_fred.py  # FRED API fetcher
│   ├── fetch_indeed.py # Indeed Hiring Lab fetcher
│   ├── fetch_warn.py  # Unemployment claims fetcher
│   └── compute_derived.py # Derived indicators + scoring
├── data/              # Pipeline output (JSON)
├── mockups/           # Design explorations
├── PRD.md             # Product requirements
└── TASKS.md           # Task tracker
```

## Running the Pipeline

```bash
export FRED_API_KEY=your_key  # Free: https://fredaccount.stlouisfed.org/apikeys
python3 scripts/build_data.py
```

Outputs JSON files to `data/` which the site reads client-side.

## Running the Site

Copy data to site directory and serve:

```bash
cp data/*.json site/data/
cd site && python3 -m http.server 8080
```

## License

Data: See individual source licenses (FRED: public domain, Indeed: CC-BY-4.0).  
Code: MIT.

## Disclaimer

The Displacement Index is an informational tool, not financial advice. All data sourced from public government and third-party databases.
