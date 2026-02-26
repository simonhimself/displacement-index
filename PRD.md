# The Displacement Index — PRD

## Overview

A public dashboard that tracks whether the "AI prosperity paradox" scenario is unfolding — where AI exceeds expectations but causes economic damage through white-collar displacement, consumer spending collapse, credit stress, and mortgage market instability.

**Not a prediction. A tracker.** We map the causal chain and let the data speak.

**Name:** The Displacement Index
**Domain:** displacementindex.com (+ .io backup)
**Tagline:** TBD — something like "Tracking what AI prosperity costs"
**X:** Posted from @simonhimself

## Goals

1. **Drive traffic** — viral, shareable, provocative data visualizations
2. **Grow newsletter subscribers** — free newsletter with weekly/biweekly updates
3. **Build social media presence** — Twitter/X account, shareable charts
4. **Establish credibility** — rigorous data, transparent methodology

## Non-Goals

- Paid tiers or subscriptions
- Investment advice or trade recommendations
- Being a Citrini derivative (own brand, own voice, own thesis framing)

## Core Concept

### The Causal Chain

We track 5 links in a macro chain. Each link has 2-4 indicators. Each indicator has a status (normal → elevated → critical) based on historical context + rate of change.

```
[AI Adoption Speed] 
    → [White-Collar Displacement] 
        → [Consumer Spending Weakness] 
            → [Credit Stress] 
                → [Mortgage/Housing Cracks]
```

### The Dashboard

- **Hero:** Single composite score or visual (thermometer? gauge? chain links?)
- **Chain view:** 5 sections, each showing its indicators with current values, trend, and status
- **History:** Each indicator shows a time series chart (interactive)
- **"Ghost GDP" indicator:** Headline feature — productivity vs wage growth divergence
- **Last updated:** Timestamp showing data freshness

### The Newsletter

- Weekly or biweekly email
- "What moved this week" — which indicators changed, what it means
- Written in an accessible, slightly provocative voice (not academic, not clickbait)
- Signup via embedded form on the site

## Data Architecture

### Source: FRED API (API key)

Core chain + context series currently used:

| Category | Indicator | FRED Series | Frequency |
|---|---|---|---|
| Displacement | Unemployment: Prof & Business Services | LNU04032239 | Monthly |
| Displacement | Unemployment: Information Industry | LNU04032237 | Monthly |
| Displacement | Employment: Prof/Sci/Tech Services | CES6054000001 | Monthly |
| Baseline | Unemployment Rate (overall) | UNRATE | Monthly |
| Spending | Real Personal Consumption | PCEC96 | Monthly |
| Spending | Consumer Sentiment (UMich) | UMCSENT | Monthly |
| Spending | Retail Sales | RSAFS | Monthly |
| Ghost GDP | Output per hour (productivity) | OPHNFB | Quarterly |
| Ghost GDP | Real median weekly earnings | LES1252881600Q | Quarterly |
| Ghost GDP | Velocity of M2 | M2V | Quarterly |
| Credit | HY OAS | BAMLH0A0HYM2 | Daily |
| Credit | CCC & Lower OAS | BAMLH0A3HYC | Daily |
| Credit | Consumer loan delinquency | DRCLACBS | Quarterly |
| Mortgage | SF mortgage delinquency | DRSFRMACBS | Quarterly |
| Context | New business applications | BABATOTALSAUS | Monthly |
| Context | Construction employment | USCONS | Monthly |
| Context | Job openings (JOLTS) | JTSJOL | Monthly |

### Source: Unemployment Claims (FRED)

- **ICSA** (weekly initial claims)
- **CCSA** (weekly continued claims)

### Source: Indeed Hiring Lab (public GitHub, CC-BY-4.0)

- Aggregate job postings index (US)
- Sector-level postings for key white-collar categories (currently: Software Development, Marketing, Media & Communications, Banking & Finance, Accounting)

### Market data
Not currently included in the index MVP (can add later if desired).

### Derived Indicators (we compute)

- **Ghost GDP Score:** Productivity growth minus real wage growth (divergence = ghost GDP)
- **Displacement Velocity:** Rate of change in white-collar unemployment vs overall
- **Chain Tension:** Composite of all 5 links — how many are flashing

## Tech Stack (current)

### Workers + Static Assets + Cron + KV (deployed)

We moved to a Cloudflare-native, self-updating architecture:

- **Hosting:** Cloudflare **Workers** with **Static Assets** binding (serves `site/`)
- **Data refresh:** Cloudflare **Cron Trigger** (every 6 hours)
- **Storage:** Cloudflare **KV** for latest snapshot blobs
- **APIs:** Worker exposes:
  - `GET /api/health`
  - `GET /api/indicators`
  - `GET /api/fred_raw`
  - `GET /api/indeed_raw`
  - `POST /api/refresh` (token-protected, optional)
- **Frontend:** reads from `/api/*` (no `site/data/*.json`)
- **Charts:** Chart.js (client-side)

**Motivation:** deploy once; Cloudflare continuously refreshes data without relying on a VPS.

### Source code
- GitHub repo: `simonhimself/displacement-index`
- Primary deployment branch: `cf-deployment`

## Design Direction (V1 Editorial — chosen Feb 23)

- **Light/warm theme** — parchment background (#F4F1EB), cream surfaces, warm tones
- **Typography:** Fraunces (serif headlines, 900 weight), DM Sans (body), JetBrains Mono (data/labels)
- **Accent:** amber/brown (#B45309) — warm, authoritative, NOT crypto/fintwit
- **Layout:** editorial magazine feel — generous whitespace, clear hierarchy, 1000px max-width
- **Chain visualization:** numbered cards in a vertical list with status badges (green/amber/red pills)
- **Ghost GDP:** featured section with comparative bar chart + gap score
- **Detail tables:** grouped by chain link, showing FRED series IDs for transparency
- **Status system:** colored pills with dots — Normal (green), Elevated (amber), Warning (orange), Critical (red)
- **Mobile-first** — responsive grid, hides secondary data on small screens
- **Reference file:** `mockups/v1-editorial.html`

## Content Strategy

- **Launch post:** Thread on X explaining the thesis + linking to the site
- **Weekly cadence:** New data → updated dashboard → newsletter → X thread
- **Evergreen:** "How to read this dashboard" explainer page
- **Commentary:** Brief editorial on each update (what moved, why it matters)

## Decisions Made

- [x] Name: **The Displacement Index** (displacementindex.com)
- [x] X strategy: post from @simonhimself
- [x] Newsletter: v2 (not MVP)
- [x] Design direction: V1 Editorial (light/warm, media-credible)
- [x] Voice: clinical observer (site), provocative angle lives in Simon’s X posts
- [x] Repo: public (GitHub)
- [x] Deployment: Cloudflare Workers + Static Assets + Cron + KV (self-updating)
- [ ] Domain purchase + custom domain routing
