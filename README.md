# The Displacement Index

**Is AI prosperity reaching the real economy?**

A public, data-driven dashboard tracking whether AI-driven productivity gains are translating into broad prosperity — or hollowing out the economy through white-collar displacement, spending weakness, credit stress, and mortgage instability.

- **Live site:** https://displacementindex.com
- **Worker URL:** https://displacement-index.simons.workers.dev
- **Repo:** https://github.com/simonhimself/displacement-index

---

## Current Architecture (Production)

This project is now fully Cloudflare-native:

- **Cloudflare Workers** (API + scheduled refresh logic)
- **Workers Static Assets** (serves `site/`)
- **Cloudflare KV** (latest + versioned snapshots)
- **Cron Trigger** (`0 */6 * * *`, every 6 hours UTC)
- **Worker Secrets** (`FRED_API_KEY`, `REFRESH_TOKEN`)
- **Workers Observability logs** enabled

No VPS is required for data refresh or site serving.

---

## Data Sources

- **FRED** (St. Louis Fed API; underlying sources include BLS/BEA/Census/FDIC/ICE-BofA/UMich)
  - 17 macro series used across displacement/spending/ghost GDP/credit/mortgage/context
- **Indeed Hiring Lab** (CC-BY-4.0)
  - Aggregate postings + selected white-collar sectors

Derived indicators are computed in the Worker:
- Ghost GDP
- Displacement Velocity
- Chain link statuses (normal/elevated/warning/critical)
- Composite Displacement Index (0–100)

---

## API Endpoints

- `GET /api/health`
- `GET /api/indicators`
- `GET /api/fred_raw`
- `GET /api/indeed_raw`
- `GET /api/runs` (recent refresh run log)
- `POST /api/refresh` (Bearer token protected)

`/api/health` now returns:
- **200** when healthy
- **503** when unhealthy (for Cloudflare Health Check alerting)

---

## Project Structure

```text
├── site/                 # Static frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── pages/
├── src/
│   └── worker.ts         # Worker API + cron refresh pipeline
├── wrangler.jsonc        # Worker/KV/assets/cron/observability config
├── PRD.md
├── TASKS.md
├── PR_STABILITY.md
├── scripts/              # Legacy/local Python pipeline (not production path)
└── data/                 # Legacy/local pipeline outputs
```

---

## Local Development

```bash
# from project root
npm run dev
```

Deploy:

```bash
npm run deploy
```

Manual refresh (requires token):

```bash
curl -X POST https://displacementindex.com/api/refresh \
  -H "Authorization: Bearer <REFRESH_TOKEN>"
```

---

## Disclaimer

The Displacement Index is an informational measurement tool, not investment advice.
