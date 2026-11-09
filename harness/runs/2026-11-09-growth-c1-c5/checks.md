# Checks: Organic Growth Sprint C1–C5 (written before the work)

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Every excerpt value and page equals the stored sample JSON | pass | `frontend/src/sampleExcerpt.test.ts` 6/6 (overview values and pages, red flags, requirements, counts) |
| 1 | The test fails when an excerpt is altered (mutation check by hand) | pass | One word removed from a red flag: 5/6 (fail). A page changed 3→2: 5/6 (fail). Restored: 6/6. |
| 2 | Sample page: anchors `key-facts`, `dates`, `points`, `checklist`, `boq` exist | pass | check.cjs: all five, 390 and 1366 px; guide links land with the heading at 80 px (after smooth scroll) |
| 2 | Sample page content unchanged, apart from the new button | pass | Rendered `main` text on local, with the new button removed, is identical to live v56 at tendertez.in (13,021 chars each). The sample JSON is untouched (git diff). |
| 3 | C4: sample page has "Analyse your own tender free" above the key facts, linking to /register | pass | Button at 546 px on a phone (key facts at 691 px), 484 px on desktop (first screen) |
| 4 | C1: each guide has an early box (top 30% of the page on a 390 px phone) with working links to /register and to the matching sample anchor | pass | Box at 9–14% of page height (old end box at about 71%). Links: EMD → #points, eligibility → #checklist, corrigendum → #dates. |
| 4 | C1: no wording decides eligibility or exemption for the reader | pass | Phrase check; EMD box says "Whether an exemption applies to you depends on that clause and your certificates"; eligibility box says "for you to confirm against the page" |
| 4 | C1: the end-of-guide box is still there; the guide's markdown leaves the new box out | pass | `.guide-cta` present on all 3 guides; local markdown of /guides/emd-exemption has the guide text and not the box (`guide-bridge` in SKIP_CLASSES) |
| 5 | C2: no made-up values left in the home preview; values match the sample; labelled as a real analysis of a closed tender; visible at 390 and 1366 px | pass | Old values (1,27,300; 63.6 lakh; boundary wall) gone; sample values present; bar reads "Real analysis · tender closed 30 May 2026"; card 507 px tall on desktop and shown on phones, with "See the full analysis" |
| 6 | C3: hero buttons are "Start your free trial" and "See a sample analysis"; tender band and /government-tenders still show the stale warning | pass | Hero buttons exact; band note "Last updated … New tenders published since then are missing."; /government-tenders "has not been updated since" (local stale state) |
| 7 | C5: comparison uses only sample values; no new time-saving or accuracy claim; no horizontal overflow at 390 px | pass | 5 rows, values from sampleExcerpt.ts (unit-tested); claim regex finds none; overflow 0 px; markdown version reads as one block per row |
| all | No change to pricing, analytics, database or schema, AI prompts or models, discovery, or configuration; sample JSON untouched | pass | git diff: only htmlToMd.js (skip list), index.css, Home, SampleAnalysis, GuideLayout, 3 guides, and new sampleExcerpt.ts and its test |
| all | No CSP errors; no layout shift on load on the changed pages | pass | 0 CSP violations; layout shift 0.0000 on every page at 390 and 1366 px. The only console error is the signed-out `/bidpilot/me` 401, also on live v56. |
| all | Nothing committed, pushed or deployed | pass | git status: working-tree changes only; HEAD still c5b137c |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 752, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 466, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 373, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 251ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 94, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| browser | check.cjs (scratchpad c1c5/) at 390 and 1366 px on the local build | pass | 91/91 |
