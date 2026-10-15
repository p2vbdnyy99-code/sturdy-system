| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 584, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 368, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 298, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 876ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 45, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 schema | migration additive; table count and cleanup list updated | pass | `0009_melted_sugar_man.sql`: 5 CREATE TABLE, 5 ADD COLUMN, FKs and indexes; no DROP; applied to `bidpilot_dev`; `connection.test.js` expects 30 tables |
| P1 tracker | stage/deadline/notes/portal saved, company-scoped, event on stage change, bad input refused | pass | `bid-workflow.test.js` 4 tracker tests; browser: kept after reload, chips shown, event recorded |
| P1 checklist | only extracted requirements, documents first, no duplicates; ticks survive identical re-analysis; custom items; Excel | pass | `bid-workflow.test.js` 5 tests; browser: 8 lines = 8 distinct requirements, ticks and item kept, xlsx downloaded |
| P2 corrigendum | quotes must be on the named page; before from the tender; AI call counted; apply updates facts with IST date | pass | `corrigendum.test.js` 2 unit + 3 HTTP; browser: 2 changes quoted, applied → key facts "5 Nov 2026", "Rs. 1,50,000/-" |
| P3 clients | CRUD, unique names, isolation, tender assignment, filter, eligibility uses the client's profile | pass | `clients.test.js` 4/4; browser: add, profile page, "For", dashboard label and filter |
| P4a portal + status | link/ID saved (http/https only), bidding status chip from the deadline | pass | `bid-workflow.test.js`; `biddingStatus.test.ts`; browser chips |
| P4b NIC | draft only | pass | Gmail draft to support-eproc@nic.in (not sent) |
| P4c feed | parser on the real page structure; polite collector (UA, no duplicates, stops on 403/captcha page); feed views; Track once; no-document guards; attach | pass | `feed.test.js` 7/7 (parser checked against a real CPPP page saved during research: 10/10 rows); browser: views, search, Track, PDF prompt, "Needs its PDF", attach |
| guards | a tracked tender without a document can't be analysed or use an allowance; doesn't count as a profile "try" | pass | `feed.test.js`: 409 `no_document`, 0 usage rows; 3 tracked + 2 attached allowed, 3rd attach needs the profile |
| browser | all features at 1440 and 375 px, no CSP/console errors | pass | `workflow-verify.mjs` 24/24 after fixing: instant ticks, corrigendum ticks keyed on status, phone top bar overflow |
| regression | earlier suites | pass | restyle 35/35, optional profile 20/20 |
| docs | architecture, operations, CLAUDE.md, privacy (15 Oct 2026), FAQ | pass | sections added; privacy lists tracker data, clients, corrigenda, the feed |
| live | deploy, migration 0009, collector switched on | unresolved | not done: waiting for "commit and deploy"; the collector stays off until the founder says to switch it on |
