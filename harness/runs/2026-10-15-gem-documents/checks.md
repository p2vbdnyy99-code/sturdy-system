# Checks: GeM bid documents on phone and PC

| step | requirement | verdict | evidence |
|---|---|---|---|
| probe | where the document link is | pass | CPPP's GeM page: "Bid Document" is a plain link to `bidplus.gem.gov.in/doc_cppp/<token>`; the same token on two fetches |
| probe | can we fetch the PDF | fail (outside our control) | bidplus resets connections from the sandbox and from Singapore; only an Indian network can reach it |
| 1 | link found on a saved real page; only CPPP GeM pages fetched | pass | `feed.test.js` unit: doc_cppp link parsed from `fixtures/cppp/gem-view.html`; http, other hosts, `tendersfullview` and path tricks refused |
| 1 | redirect, cache, fallbacks, limits | pass | `feed.test.js` HTTP: 302 to the doc link; second click uses the cache (one fetch); no link or a network error → 302 to the GeM page; central row and a bad id → 404; 429 after 20 a minute; `documentUrl` only on GeM rows |
| 1 | against real CPPP | pass | harness: `/bidpilot/public/tenders/<gem id>/document` → 302 to a real `bidplus.gem.gov.in/doc_cppp/...` link |
| 2 | PC and phone behaviour | pass | `gem-doc-verify.mjs` 10/10: every GeM row has "Bid document (PDF)"; PC: new tab, which requests the doc_cppp URL, list stays open; central rows have none; phone (Pixel 7, touch): same tab, no new tab, the tab requests the doc_cppp URL; buttons full width (364 px) and 44 px tall; hint shown; no sideways scroll; no CSP errors |
| 2 | phone layout | pass | first tender at ~1,170 px instead of ~1,770 (Pixel 7); tabs in one row; filters two to a row; screenshots checked |
| 2 | what GeM sends back | unresolved | can't be seen from outside India; the founder to try on their phone after the deploy |
| regression | tender search suite | pass | `tender-search-verify.mjs` 29/29 |
| 3 | docs | pass | architecture section; FAQ; OPERATIONS; CLAUDE.md collector rule (the one on-demand page read) |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 595, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 374, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 304, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 610ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
