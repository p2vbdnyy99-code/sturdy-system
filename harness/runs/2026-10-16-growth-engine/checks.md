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
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 630, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 393, fail 0, skipped 25 |
| backend tests: no database | all backend tests pass | pass | pass 322, fail 0, skipped 38 |
| frontend build | type check and build succeed | pass | built in 1.14s |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 49, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 2–3 | marketing CRM, queue, report, dashboard, SEO audit, MCP | pass | `python3 -m unittest discover -s tests` in marketing/automation: 22/22, no ResourceWarnings (run with `-W error::ResourceWarning`) |
| 3 | MCP live in Claude Code | pass | server loaded from `.mcp.json`; `search_saved_prospects` returned the CRM; `draft_linkedin_post` + `draft_x_post` queued; "100% accurate … win bids" refused with "claim not allowed: no accuracy promise" |
| 4 | landing description length | pass | `landing-pages.test.js` 6/6 incl. new long-organisation assertion; live audit before fix: 1 page at 208 chars |
| 6 | no prospect or user names in committed marketing docs | pass | grep for the CRM's company names over `marketing/**/*.md,csv` outside `data/`: only TenderJunction as a public competitor listing |
| 7 | content calendar | pass | 29 items over 30 days; every draft passes `content.lint`; 22 queued + 2 via MCP; 0 duplicates |
