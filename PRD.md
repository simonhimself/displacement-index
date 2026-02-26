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

### Source: FRED API (free, 120 req/min, API key required)

| # | Indicator | FRED Series | Frequency | Lag |
|---|-----------|-------------|-----------|-----|
| 1 | Unemployment: Professional & Business Services | LNU04032239 | Monthly | ~2 weeks |
| 2 | Unemployment: Information Industry | LNU04032237 | Monthly | ~2 weeks |
| 3 | Employment: Prof/Scientific/Tech Services | CES6054000001 | Monthly | ~2 weeks |
| 4 | Real Personal Consumption | PCEC96 | Monthly | ~4 weeks |
| 5 | Consumer Sentiment (UMich) | UMCSENT | Monthly | ~2 weeks |
| 6 | Retail Sales | RSAFS | Monthly | ~2 weeks |
| 7 | M2 Money Velocity | M2V | Quarterly | ~2 months |
| 8 | HY Credit Spreads (ICE BofA) | BAMLH0A0HYM2 | Daily | 1 day |
| 9 | CCC & Lower Spreads | BAMLH0A3HYC | Daily | 1 day |
| 10 | Consumer Loan Delinquency | DRCLACBS | Quarterly | ~2 months |
| 11 | Mortgage Delinquency (Single-Family) | DRSFRMACBS | Quarterly | ~2 months |
| 12 | Nonfarm Productivity (Output/Hour) | OPHNFB | Quarterly | ~2 months |
| 13 | Real Median Weekly Earnings | LES1252881600Q | Quarterly | ~2 months |

### Source: WARN Firehose (free API, daily)

- Mass layoff notices by sector
- Can filter for tech/professional services
- LEADING indicator (60 days ahead of actual layoffs)

### Source: S&P 500 / Market Data

- Yahoo Finance API or similar free source
- Daily close

### Derived Indicators (we compute)

- **Ghost GDP Score:** Productivity growth minus real wage growth (divergence = ghost GDP)
- **Displacement Velocity:** Rate of change in white-collar unemployment vs overall
- **Chain Tension:** Composite of all 5 links — how many are flashing

## Tech Stack

### Option A: Static Site + VPS Data Pipeline (recommended)
- **Site:** Static HTML/JS (or Astro/11ty), hosted on Cloudflare Pages (free)
- **Data pipeline:** Python script on our VPS, runs via cron
  - Fetches FRED + WARN data
  - Computes derived indicators
  - Writes JSON files
  - Pushes to git repo → auto-deploys to Cloudflare Pages
- **Charts:** Chart.js or D3.js (client-side rendering)
- **Newsletter:** Buttondown (free tier: 100 subscribers) or Substack (free, but less control)
- **Domain:** ~$10/year

### Why not a dynamic backend?
- Our VPS is 4GB, already running OpenClaw
- FRED data updates at most daily, mostly monthly
- Static site = zero server costs, infinite scale, no maintenance
- Data freshness is fine with daily cron updates

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
- [ ] Design direction: dark/terminal aesthetic (proposed, pending confirm)
- [ ] Voice/brand personality
- [ ] Legal disclaimer wording
- [ ] Domain purchase
