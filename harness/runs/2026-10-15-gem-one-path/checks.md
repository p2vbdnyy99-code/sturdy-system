# Checks: one path to a GeM bid's document

| step | requirement | verdict | evidence |
|---|---|---|---|
| probe | what "goes blank" | pass | CPPP's GeM page opened in a phone browser (Pixel 7) still shows bid GEM/2026/B/8128028 after 10 s (CPPP's own scripts throw errors but the page stays); its "Bid Document" link is the broken doc_cppp link |
| 1 | "Bid details" removed | pass | `feed.test.js` 17/17: no `details` on rows; `gem-find-verify.mjs`: no "Bid details" on PC or phone |
| 2 | GeM instruction | pass | `gem-find-verify.mjs` 14/14: after "Find on GeM" the row reads "Bid number copied. On GeM, paste it into the search box, open the bid and download the document."; clipboard holds the bid number; GeM's list opens in a new tab; state rows still copy their tender ID; phone buttons full width; no CSP errors |
| 3 | docs | pass | architecture section, FAQ, CLAUDE.md rule |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 594, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 373, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 303, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 686ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| live | deploy | pass | `analyzing_now=0 migrations=11` (no migration); `flyctl deploy` exit 0 (commit d8539ed) |
| live | tendertez.in | pass | `gemfind-live.mjs` 14/14, PC and Pixel 7: "Find on GeM" copies GEM/2026/B/8127195 and opens GeM's list in a new tab; the GeM instruction shows; no "Bid details"; API rows have no `details`; `/document` 404; no sideways scroll; no console or CSP errors |
