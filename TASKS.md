# The Displacement Index — Task Tracker

## Status Key
- [ ] Todo
- [~] In progress
- [x] Done
- [!] Blocked

---

## Phase 0: Decisions ✅
- [x] Name: **The Displacement Index** (displacementindex.com — likely available)
- [x] Newsletter: v2 (not MVP)
- [x] Design direction: V1 Editorial — warm parchment tones, Fraunces serif, DM Sans body, JetBrains Mono data
- [x] X strategy: post from @simonhimself
- [x] Voice: clinical observer (site), provocative contrarian (X posts from Simon)
- [x] Repo: public GitHub
- [x] Domain: not purchased yet (waiting until site ready)

## Phase 1: Data Pipeline ✅
- [x] FRED API key — reused from trading-system (secrets/fred.env)
- [x] `fetch_fred.py` — 17 FRED series (14 original + 3 context: BABATOTALSAUS, USCONS, JTSJOL)
- [x] `fetch_warn.py` — initial/continued claims as layoff proxy
- [x] `fetch_indeed.py` — Indeed Hiring Lab postings (aggregate + 5 white-collar sectors, CC-BY-4.0)
- [x] `compute_derived.py` — Ghost GDP, displacement velocity, chain statuses, composite 0-100
- [x] `build_data.py` — orchestrator (all 4 fetchers + compute)
- [x] Full pipeline tested — 3,302 FRED obs + 730 Indeed obs, 18.4s, DI = 10/100
- [ ] Wire Indeed + context indicators into site frontend
- [ ] Cron job on VPS (daily 06:00 UTC) — after site deploy

## Phase 2: Website MVP
- [x] Design mockups — V1 Editorial chosen (v1-editorial.html)
- [x] frontend-design + cloudflare skills added to agent config
- [~] **Production site build (V1 Editorial → real site)**
  - [ ] Set up project structure (static site, build system)
  - [ ] Wire data pipeline JSON → dynamic HTML rendering
  - [ ] Add interactive charts (Chart.js) per indicator
  - [ ] Add time series sparklines in chain overview
  - [ ] Methodology/about page
  - [ ] Disclaimer footer
  - [ ] Mobile responsive polish
  - [ ] OG meta tags for social sharing
- [ ] GitHub repo setup (public)
- [ ] Cloudflare Pages deploy

## Phase 3: Content & Launch
- [ ] "How to read this dashboard" explainer copy
- [ ] Launch thread for X
- [ ] OG images / social sharing cards
- [ ] Soft launch → feedback
- [ ] Public launch

## Phase 4: Automation & Growth
- [ ] Auto-generate shareable chart images for X
- [ ] Pipeline monitoring (failure alerts)
- [ ] SEO (meta tags, sitemap, structured data)
- [ ] Newsletter integration (v2)

---

## Log
- 2026-02-23: Project created. PRD written. Data sources researched.
- 2026-02-23: Phase 1 COMPLETE. Pipeline working. DI = 5/100 (Normal). Credit stress only elevated link.
- 2026-02-23: Design exploration. Two mockups (V1 Editorial, V2 Stark). V1 chosen. frontend-design + cloudflare skills added.
- 2026-02-23: Starting Phase 2 production build.
- 2026-02-23: Production site built (V1 editorial, dynamic from JSON, Chart.js charts). Working preview.
- 2026-02-26: Added 3 context FRED series (new biz apps, construction employment, JOLTS) + Indeed Hiring Lab postings (aggregate + 5 sectors). Inspired by Citadel counter-thesis. SW dev postings 29% below pre-COVID = interesting signal. DI moved 5→10 as credit stress ticked to Warning.
