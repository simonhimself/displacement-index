# PR Plan — Stability Hardening (feat-stability)

Goal: make Cloudflare auto-refresh resilient, observable, and safe under partial upstream failure.

## Checklist

- [x] 1) Add resilient upstream fetch wrapper (timeout + retry + backoff)
- [x] 2) Parallelize FRED pulls + per-series fallback to last good snapshot
- [x] 3) Add Indeed fallback to last good snapshot (don’t fail whole refresh)
- [x] 4) Implement versioned KV snapshots + atomic pointer flip (`latest:version`)
- [x] 5) Add refresh lock to avoid overlapping cron/manual refreshes
- [x] 6) Add run metadata (`last_attempt`, `last_success`, `last_error`, `consecutive_failures`) + `/api/health` enrichment
- [x] 7) Add rolling run log in KV (last 50 runs)
- [x] 8) Add frontend stale-data banner (>12h) based on `generated_at`
- [x] 9) Smoke test locally against prod endpoints, deploy, verify health + data freshness
- [x] 10) Commit with summary and mark plan complete

## Notes
- No behavior/product changes to methodology or scoring.
- Keep API contracts backward-compatible where possible.
- Implemented on `feat-stability`, then merged into `main`.
