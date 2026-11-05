# Checks: home page and copy freshness patch

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Band wording: fresh/delayed/unknown unchanged; stale on one date gives one date; different dates each named; one stale list only changes its own label; never read gives no invented date | pass | frontend freshness.test.ts +5 (10/10) |
| 2 | Band at 390 and 1366 px: counts kept, labels, note, button, no layout shift, no overflow, no errors/CSP | pass | home-browser-check.cjs: fresh 14/14, stale-same 18/18, stale-different 14/14, never 14/14; load layout shift 0.0000 everywhere (band at y=1372 px on phones, 705 px on desktop); screenshots home-band-*.png |
| 3 | FAQ and Features show the qualified saved-search sentence | pass | home-browser-check.cjs stale-same at 390 and 1366 px |
| 3 | No regression in the tender lists | pass | Phase 1 list-browser-check 40/40 and v55 freshness-browser-check (fresh) 19/19, with fresh local data |
| all | No discovery, database, pricing, CPPP configuration or daily-post change; nothing committed, pushed or deployed | pass | git diff limited to freshness.ts, its test, Home.tsx, Faq.tsx, Features.tsx, index.css and docs |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 752, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 466, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 373, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 319ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 88, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |

## Review corrections (written before the work)

| step | requirement | verdict | evidence |
|---|---|---|---|
| 5 | Phase 1 list check and v55 freshness check pass with fresh data and assert the fresh wording | pass | state-checks.sh fresh: list 59/59, freshness 22/22 |
| 5 | The same checks pass with stale (3 days) and unavailable (23 Oct) data, asserting the dated count line, the warning and no "right now" | pass | stale 2 Nov: list 77/77, freshness 31/31; unavailable 23 Oct: list 77/77, freshness 31/31 |
| 5 | Delayed list check passes at 390 and 1366 px | pass | delayed-check 5/5 |
| 5 | Each check fails if the server is not in the state it was told | pass | run against never-read data: list fresh exit 1 (21 failed), freshness fresh exit 1 (state check failed, then an error), delayed exit 1, home delayed exit 1, home fresh exit 1 |
| 6 | Home delayed: usual labels, no note, no date, no current-data claim; the search page it links to says the update is late | pass | home delayed 23/23 (central and state 5 h old, GeM 1 h) |
| 6 | Home unknown (missing, null, failed facets): usual labels, no note, no date, no current-data claim | pass | home unknown 61/61 over a stale server; failed facets shows "—" counts and "Search tenders" |
| 6 | Existing home states still pass (fresh, stale-same, stale-different, never) | pass | fresh 15/15, stale-same 19/19, stale-different 15/15, never 15/15 (each +1 for the server-state check) |
| 8 | verify.sh, git diff --check and secret scan pass | pass | backend 752/466/373 pass, 0 fail; build; lint 0 errors; frontend 88/88; secret scan clean; git diff --check clean |
