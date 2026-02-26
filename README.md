# The Displacement Index

The Displacement Index is a public macro dashboard that tracks whether AI-driven productivity gains are spreading broadly through the economy or concentrating alongside labor and credit stress.

## What it tracks

The model follows a five-link chain:

1. **White-Collar Displacement**
2. **Consumer Spending**
3. **Ghost GDP** (productivity vs wage growth divergence)
4. **Credit Stress**
5. **Mortgage & Housing Stress**

Each link is scored from underlying indicators, then combined into a composite **0–100 Displacement Index**.

## Data sources

- **FRED** (macro/labor/credit/housing time series)
- **Indeed Hiring Lab** (job postings, CC-BY-4.0)

The dashboard currently uses 17 FRED series plus selected Indeed sector series.

## Tech stack

- Cloudflare Workers (API + scheduled refresh)
- Workers Static Assets (frontend hosting)
- Cloudflare KV (snapshot storage)
- Cron trigger (`0 */6 * * *`, every 6 hours UTC)

## Project structure

```text
├── site/                 # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── pages/
├── src/
│   └── worker.ts         # API + refresh pipeline
├── wrangler.jsonc        # Cloudflare config
├── PRD.md                # Product requirements
├── TASKS.md              # Project tracker
├── scripts/              # Legacy/local research scripts
└── data/                 # Legacy/local outputs
```

## Local development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Disclaimer

This project is an informational measurement tool and does not constitute financial advice.
