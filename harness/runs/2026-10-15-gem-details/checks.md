# Checks: "Bid details" on GeM tenders

| step | requirement | verdict | evidence |
|---|---|---|---|
| probe | CPPP's GeM page opens for anyone | pass | no-session fetch: 200, bid GEM/2026/B/8003830, organisation, start/end dates, quantity, product category; no "Invalid Url", no captcha |
| 1 | API | pass | `feed.test.js`: `bidDetails` on GeM fixture rows → CPPP GeM page; central/state → null; foreign or missing stored link → null; the HTTP row for a GeM bid carries it, others `null` |
| 2 | UI | pass | `gem-find-verify.mjs` 16/16: "Bid details" on every GeM row (PC and Pixel 7), CPPP GeM page, new tab; none on state rows; phone buttons 364 px wide; "Find on GeM" still copies and opens; no sideways scroll; no CSP errors |
| 3 | docs | pass | architecture section, FAQ, CLAUDE.md rule |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 594, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 373, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 303, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 638ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
