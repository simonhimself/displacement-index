# The Displacement Index — PRD

## Overview

The Displacement Index is a public dashboard that tracks whether AI-driven productivity gains are flowing through to households, or concentrating while labor and credit conditions deteriorate.

**Positioning:** Not a prediction market. Not a hot take feed. A transparent macro tracker.

- **Name:** The Displacement Index
- **Domain:** https://displacementindex.com
- **Voice:** Clinical observer on-site; interpretation/opinion lives on Simon’s X account
- **Distribution:** Posted from @simonhimself

## Product Goals

1. Build a credible, shareable public macro dashboard
2. Track chain-linked labor/spending/credit signals in one place
3. Create a reliable self-updating system with minimal operational overhead
4. Provide transparent methodology + open-source implementation

## Non-Goals (MVP)

- Paid subscriptions
- Investment recommendations
- Newsletter implementation (planned for v2, not MVP)
- Heavy custom backend infrastructure

## Core Framework

### Causal Chain

We monitor five linked stress points:

1. **White-Collar Displacement**
2. **Consumer Spending**
3. **Ghost GDP** (productivity/wage divergence)
4. **Credit Stress**
5. **Mortgage & Housing Stress**

A composite index (0–100) summarizes chain severity from individual link statuses.

### Indicator Method

- Each indicator is normalized via z-score vs 5-year history
- Link statuses: normal / elevated / warning / critical
- Composite maps link status levels into a 0–100 score

## Data Sources (Current)

### FRED (primary)
17 series across labor, spending, productivity, credit, mortgage, and context:

- Displacement: `LNU04032239`, `LNU04032237`, `CES6054000001`, `UNRATE`
- Spending: `PCEC96`, `UMCSENT`, `RSAFS`
- Ghost GDP: `OPHNFB`, `LES1252881600Q`, `M2V`
- Credit: `BAMLH0A0HYM2`, `BAMLH0A3HYC`, `DRCLACBS`
- Mortgage: `DRSFRMACBS`
- Context: `BABATOTALSAUS`, `USCONS`, `JTSJOL`

### Indeed Hiring Lab (CC-BY-4.0)
- Aggregate postings index
- Sector postings (Software Dev, Marketing, Media & Comms, Banking & Finance, Accounting)

## Technical Architecture (Current Production)

### Cloudflare-native stack

- **Workers runtime** (`src/worker.ts`)
- **Static Assets binding** serving `site/`
- **KV** for snapshot storage
- **Cron Trigger** every 6 hours (`0 */6 * * *`)
- **Secrets:** `FRED_API_KEY`, `REFRESH_TOKEN`
- **Observability logs:** enabled in Wrangler + dashboard

### API surface

- `GET /api/health`
- `GET /api/indicators`
- `GET /api/fred_raw`
- `GET /api/indeed_raw`
- `GET /api/runs`
- `POST /api/refresh` (Bearer protected)

### Reliability hardening implemented

- Fetch timeout + retry/backoff
- Parallel FRED pulls with per-series fallback
- Indeed fallback to last good snapshot
- Versioned KV snapshots + atomic pointer switch
- Refresh lock to reduce overlap races
- Run metadata + rolling run log
- Frontend stale data banner (>12h)
- `/api/health` returns **503** when unhealthy (for Health Check alerting)

## UX / Design (V1 Editorial)

- Warm parchment editorial style (not crypto/fintwit aesthetic)
- Fraunces + DM Sans + JetBrains Mono
- Inline metric tooltips with concise definitions + sources
- Methodology and About pages
- Mobile-responsive layout

## Launch/Operations Status

- Domain live on Cloudflare: `displacementindex.com`
- Worker custom domain attached (`root` + `www`)
- Health check notification configured on `/api/health` unhealthy state
- Main branch in GitHub is source-of-truth

## Open Decisions / Next Enhancements

1. Optional GitHub → Cloudflare automatic deploy on push (vs manual `wrangler deploy`)
2. Optional historical storage (R2/D1) for long-term charting
3. Optional recovery notification (`becomes healthy`) in Cloudflare
4. Newsletter integration (v2)

## Decisions Made

- [x] Brand + domain: The Displacement Index / displacementindex.com
- [x] Cloudflare-native deployment (Workers + Assets + KV + Cron)
- [x] Public GitHub repo for transparency
- [x] V1 Editorial design direction
- [x] Site voice: neutral/clinical, data-first
- [x] Newsletter deferred to v2
