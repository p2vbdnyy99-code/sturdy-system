# Checks: growth engine phase 1–2

| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 630, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 393, fail 0, skipped 25 |
| backend tests: no database | all backend tests pass | pass | pass 322, fail 0, skipped 38 |
| frontend build | type check and build succeed | pass | built in 594ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 49, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 2 | landing pages, structured data, llms.txt | pass | `landing-pages.test.js` 6/6 (incl. real-app HTTP); browser `landing-verify.mjs` 14/14 desktop + 375 px, no CSP errors |
