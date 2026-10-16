| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 638, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 400, fail 0, skipped 25 |
| backend tests: no database | all backend tests pass | pass | pass 324, fail 0, skipped 40 (first run failed 1: the new real-app test ran without a database, where the app answers 503; now skipped there, as landing-pages.test.js does) |
| frontend build | type check and build succeed | pass | built in 631ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors (unchanged) |
| frontend unit tests | all pass | pass | pass 49, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 | public tender chosen | pass | AIIMS Bhubaneswar NIT 11/2026, 35 pages, text-based, on aiimsbhubaneswar.nic.in; opens without cookies (200, application/pdf, inline) |
| 2 | one analysis, no DB writes | pass | `sample-analysis-run.mjs` in the Fly machine: SHA-256 matched, 3 chunks, 0 failed, ~36k tokens (flex), 72 s; in-memory only |
| 3 | output checked before publishing | pass | 34 quoted snippets: 26 exact on the cited page, 8 on the cited page across table cells/superscripts; 100 requirement/flag/BOQ items: 99 ≥ 90% word overlap, 1 list continues p.25→26 (stated on the page); no emails, phones or names |
| 4 | served and stored as produced | pass | `sample-page.test.js` 3/3 with a database |
| 5 | page and links in the browser | pass | `sample-check.mjs` 20/20 at 375 px and 1280 px |
