| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 555, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 363, fail 0, skipped 18 |
| backend tests: no database | all backend tests pass | pass | pass 294, fail 0, skipped 29 |
| frontend build | type check and build succeed | pass | built in 465ms |
| frontend lint | lint exits 0 | pass | 11 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 43, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 server gate | 1st/2nd upload 201 without a profile; 3rd 409 with `missing`, nothing stored; first-2 analysis allowed; 3rd refused and NOT_STARTED; other companies don't count; complete → accepted | pass | `profile-gate.test.js` 6/6 |
| 2 shared number | app and server agree; tenders-left and wording | pass | `profile-fields-sync.test.js` 3/3; `profileGate.test.ts` 2/2 |
| 3 no redirect + dialog | new company on the dashboard with the list; 3rd upload opens the dialog, not the picker; field count; focus on the main button; Escape and "Not now" close; 409 path; fill in → back; upload works after | pass | `optional-profile-verify.mjs` 20/20 (harness, final build); screenshots `restyle/optional-{d,m}-dialog.png` |
| 4 reminder | 2 left, 1 left (unit), none left → warning, complete → none | pass | browser: "add 2 more tenders", then the warning, then gone after completing; first wording said "used your 2 tenders", which clashed with the plan's "0 of 5 tenders used"; changed to "added" |
| 5 text | FAQ, privacy, OPERATIONS, CLAUDE.md, architecture | pass | FAQ "Do I have to fill in the company profile?"; privacy "optional for your first 2 tenders, then required" (date 12 Oct 2026 = today); no page says it is required before the first tender |
| 6 regression | the restyle's browser checks | pass | `restyle-verify.mjs` 35/35 (the two setup checks changed to the new behaviour) |
| 7 real accounts | effect of the rule | pass | read-only production query: Skylark has 2 tenders, gem tender 1, neither has a profile. After the deploy Skylark can still analyse its 2 tenders but gets the dialog on a 3rd upload; gem tender can add 1 more |
| 8 live | deploy and live check | unresolved | waiting for "commit and deploy" |
