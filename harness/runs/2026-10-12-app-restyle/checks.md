| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 553, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 362, fail 0, skipped 18 |
| backend tests: no database | all backend tests pass | pass | pass 293, fail 0, skipped 29 |
| frontend build | type check and build succeed | pass | built in 763ms |
| frontend lint | lint exits 0 | pass | 11 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 41, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 baseline | before screenshots | pass | 20 screenshots at 1280 and 375 px (scratchpad `restyle/before-*`) |
| 2 shell | every signed-in page in the frame; nav, log out, current page marked, visible focus | pass | `restyle-verify.mjs`: rail Dashboard/Profile `aria-current`, log out → /login, focus outline 3px solid (the first version of this check passed on the active icon's shadow; fixed and recorded as lesson 17) |
| 3 queue | only this company's tenders; due-soon tab, search, open tender highlighted; allowance equals the API, hidden when unlimited | pass | Due soon 1, All = API total, search "sbi" → 1, the opened tender `aria-current`, "2 of 5 tenders used" = summary, 5 segments with 2 filled; `queue.test.ts` 3/3; list comes from the existing company-scoped API |
| 4 tender page | values from the API; dates timeline; dark card wording incl. no deadline, closed, not checked, checked-all-unclear; states, tabs, evidence, document still work | pass | red-flag chip = API count and opens the tab; 6 key-fact rows; one timeline entry per parsed date + Today; "0 of 9 requirements appear met" after a check that left all 9 unclear (was "not checked yet": fixed with `eligibilityWasChecked`); no verdict wording; every tab opens; Analyze from the notice fills the page; `timeline.test.ts` 4/4, `deadlineSummary.test.ts` 5/5 |
| 5 dashboard | upload, filters, sort, pagination; counts equal the API; next deadline | pass | glance rows = summary; analysis-state filter → 1 row; sort toggles `aria-sort`; upload adds a row and the queue count; dark card names the nearest deadline |
| 6 profile | profile save and "None" still work; setup mode without the queue, dashboard still blocked | pass | setup check in `restyle-verify.mjs`; the profile form is unchanged inside a panel (sign-in run's profile checks still apply). Company setup (`/onboarding/create-company`) stays on the sign-in layout: it has no company yet, so the queue can't exist (plan deviation) |
| 7 browser | 1680, 1280 and 375 px: no sideways scroll, no CSP or console errors, no inline styles | pass | `restyle-shots.mjs after`: clean; `restyle-verify.mjs` 35/35; `grep 'style={' src` empty. A first pass found phone overflow from a no-wrap meta line, fixed |
| 8 docs | architecture, CLAUDE.md | pass | section "App restyle after a clinic-OPD reference"; CLAUDE.md rule for the shell and lesson 17 |
| 9 live | deploy and live check | unresolved | not done: waiting for "commit and deploy" |
