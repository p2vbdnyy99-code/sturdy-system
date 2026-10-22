# Checks: live insights dashboard (22 Oct 2026)

| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 648, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 402, fail 0, skipped 27 |
| backend tests: no database | all backend tests pass | pass | pass 326, fail 0, skipped 42 |
| frontend build | type check and build succeed | pass | built in 509ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 57, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1-3 | only the founder sees it; counts leave the founder's accounts out | pass | `test/bidpilot/insights.test.js` 10/10 (401 / 404 / 200, `isAdmin`, seeded counts, previous period, paid plans, campaigns, accounts, feed) |
| 4 | chart helpers | pass | `src/insights/chart.test.ts` 5/5 |
| 4 | page works at phone and desktop width | pass | `check-insights.mjs` on the real server (local seeded DB), 390 px and 1366 px: 18/18 (hero 1 paying, 4 KPIs, live 3, rail link for founder only, no sideways scroll, tooltip on hover/tap and keyboard, 0 CSP errors, customer blocked); screenshots inspected, 3 visual faults fixed and re-checked |
| 5 | palette | pass | `validate_palette.js "#d96f0c,#1f8fd0" --mode dark --surface "#0b1a2e"`: all checks pass |
