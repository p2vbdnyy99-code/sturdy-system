# Checks: GeM bids open GeM's own bid search

| step | requirement | verdict | evidence |
|---|---|---|---|
| probe | why the PDF button failed | pass | founder: fails on Windows, iPhone and Android; it redirected to CPPP's `doc_cppp` link, which is what failed on CPPP itself. Public notices show GeM's working links use an internal number (GEM/2025/B/6799413 → `showbidDocument/8483482`); bidplus answers 503 / resets from outside India |
| 1 | redirect removed | pass | `gemDocument.js` and the fixture deleted; `feed.test.js`: no `documentUrl`, `/public/tenders/:id/document` → 404 |
| 2 | GeM rows → GeM's bid list | pass | `feed.test.js`: `findOnPortal` for GeM = all-bids, "Find on GeM", the bid number; every fixture row's link https on an allowed host, never a CPPP full-view link, always an ID to search |
| 3 | one tap copies and opens, PC and phone | pass | `gem-find-verify.mjs` 11/11: PC and Pixel 7, "Find on GeM" → `https://bidplus.gem.gov.in/all-bids` in a new tab and the clipboard holds the bid number; the row says "Bid number copied"; a Kerala row copies its tender ID and opens the Kerala portal search; no PDF button; no sideways scroll; no CSP errors |
| regression | tender search suite | pass | `tender-search-verify.mjs` 29/29 (GeM expectations moved to all-bids; two checks now wait for the state grid and filter; the Track-twice count scoped to the company) |
| 4 | docs | pass | architecture section; FAQ; OPERATIONS; CLAUDE.md rule and lesson 19 |
| live | GeM's bid search finds the bid and its document | unresolved | only reachable from India; the founder to try after the deploy |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 594, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 373, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 303, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 639ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
