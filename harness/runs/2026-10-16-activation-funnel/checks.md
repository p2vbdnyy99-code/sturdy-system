| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 635, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 397, fail 0, skipped 25 |
| backend tests: no database | all backend tests pass | pass | pass 322, fail 0, skipped 39 |
| frontend build | type check and build succeed | pass | built in 727ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 49, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 | ready-to-analyse summary | pass | `dashboard-summary.test.js` 12/12 incl. new case (PDF + extracted + NOT_STARTED only, newest first, company-scoped) |
| 1 | ready-to-analyse in the browser | pass | `ready-check.mjs` 12/12: phone button at 627 px of 812 (was ~2,450 px), desktop 417 px; only the waiting tender; no sideways scroll; no CSP errors; click → "Analyzing the document…" on the tender page; card gone after |
| 2 | funnel report queries | pass | `funnel-report.test.js` 4/4 (Postgres); `visits-report.mjs 7` runs locally |
| 2 | production baseline (read-only) | pass | 30 d: uploads 6 → analysed 4 (4 within 24 h), waiting 2, failed 0; feed 2, PDF 0; 1 new account linked to a same-day journey |
| 3 | follow-up draft | pass | Gmail draft in the existing thread; not sent |
