# Checks

| ID | Requirement | How |
|---|---|---|
| C1 | Every public title ≤60 and description 70–160 characters | `seo.test.js` |
| C2 | A state filter of Kerala or Keralam returns both spellings; facets show one Kerala with the summed count | `publicTenders` repo test |
| C3 | `/government-tenders/state/keralam` answers 301 to `/state/kerala`; landing pages list one Kerala | landing-pages test |
| C4 | `/guides` and the 3 guides are in PUBLIC_PAGES, the sitemap and llms.txt, indexable, with Article JSON-LD on each guide | `seo.test.js` |
| C5 | Every guide quote matches its source PDF (checked 24 Oct, see marketing/seo/pages/P4–P6) | review |
| C6 | `/`, `/features`, `/pricing`, `/faq`, `/about`, `/government-tenders`, `/privacy-policy`, `/guides*` serve their H1 and ≥150 words of text in the server HTML | seo test on rendered HTML + curl on harness |
| C7 | Pages render correctly in a browser after the app loads (no blank page, no console CSP errors), at 390 px and desktop | Playwright |
| C8 | Sitemap has `<lastmod>` for landing pages and guides only | `seo.test.js` |
| C9 | A request with a GPTBot / ClaudeBot / PerplexityBot user agent is counted once per day, bot and page; a normal browser is not; no IP or full user agent stored | crawlers test |
| C10 | /insights shows crawler counts for the period, founder only | insights test + browser |
| C11 | verify.sh passes (backend tests ×3, frontend build, lint, unit tests, secret scan) | verify.sh |
| backend tests: database + CSRF secret | all backend tests pass | fail | pass 654, fail 5, skipped 1 |
| backend tests: database only | all backend tests pass | fail | pass 410, fail 3, skipped 27 |
| backend tests: no database | all backend tests pass | fail | pass 331, fail 3, skipped 43 |
| frontend build | type check and build succeed | pass | built in 253ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 57, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| backend tests: database + CSRF secret | all backend tests pass | fail | pass 657, fail 2, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 413, fail 0, skipped 27 |
| backend tests: no database | all backend tests pass | pass | pass 334, fail 0, skipped 43 |
| frontend build | type check and build succeed | pass | built in 236ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 57, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 659, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 413, fail 0, skipped 27 |
| backend tests: no database | all backend tests pass | pass | pass 334, fail 0, skipped 43 |
| frontend build | type check and build succeed | pass | built in 224ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 57, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
