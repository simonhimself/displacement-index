# The Displacement Index — Task Tracker

## Status Key
- [ ] Todo
- [~] In progress
- [x] Done
- [!] Blocked

---

## Phase 0: Product Decisions
- [x] Name: **The Displacement Index**
- [x] Domain purchased + live: `displacementindex.com`
- [x] Voice: clinical observer on site
- [x] Distribution: Simon’s X account (`@simonhimself`)
- [x] Newsletter deferred to v2
- [x] Public GitHub repo

## Phase 1: Data + Scoring Pipeline
- [x] FRED series integration (17 series)
- [x] Indeed Hiring Lab integration (aggregate + 5 sectors)
- [x] Derived indicators (Ghost GDP, Displacement Velocity)
- [x] Link-level status model + composite 0–100 index
- [x] Data pipeline ported to Worker runtime for production refresh
- [x] Legacy Python scripts retained for local research/backfill only

## Phase 2: Site + UX
- [x] V1 Editorial design implementation
- [x] Dashboard rendering from live `/api/*`
- [x] Chart.js integration and sizing stability fixes
- [x] About + Methodology pages
- [x] Inline metric tooltips (V1)
- [x] Mobile responsive polish
- [x] Canonical URL + basic OG/meta
- [ ] Optional: richer social OG image generation

## Phase 3: Cloudflare Deployment
- [x] Workers + Static Assets deployment
- [x] KV namespace wiring (prod + preview)
- [x] Cron refresh every 6h (`0 */6 * * *`)
- [x] Secrets in Worker (`FRED_API_KEY`, `REFRESH_TOKEN`)
- [x] Custom domains attached (`displacementindex.com`, `www`)
- [x] Main branch pushed and synced with production deploys
- [ ] Optional: automate deploy on push (GitHub → Cloudflare)

## Phase 4: Reliability / Observability
- [x] Retry/backoff + timeout hardening
- [x] Fallbacks to previous snapshot on partial source failures
- [x] Versioned KV snapshots + atomic pointer
- [x] Refresh lock to avoid overlap races
- [x] `/api/runs` run log endpoint
- [x] Enriched `/api/health`
- [x] `/api/health` returns 503 when unhealthy
- [x] Workers observability logs enabled
- [x] Cloudflare Health Check alert on unhealthy state
- [ ] Optional: Cloudflare recovery alert (becomes healthy)
- [ ] Optional: Workers Observability alert policy (if account UI exposure appears)

## Phase 5: Content & Launch
- [ ] Publish “How to read this dashboard” explainer
- [ ] Launch post/thread on X
- [ ] Build repeatable update cadence (weekly summary)
- [ ] Newsletter integration (v2)

---

## Log (condensed)
- 2026-02-23: Initial project + design direction selected
- 2026-02-26: Cloudflare Workers architecture fully deployed
- 2026-02-26: Domain connected and production live on `displacementindex.com`
- 2026-02-26: Stability and health-monitoring hardening completed
