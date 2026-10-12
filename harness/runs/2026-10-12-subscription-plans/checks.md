| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 517, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 352, fail 0, skipped 16 |
| backend tests: no database | all backend tests pass | pass | pass 283, fail 0, skipped 27 |
| frontend build | type check and build succeed | pass | built in 1.06s |
| frontend lint | lint exits 0 | pass | 10 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 27, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 catalogue | 3 plans with the agreed prices and limits; UNLIMITED not sold | pass | `plans.test.js`: STARTER ₹3,999/10, GROWTH ₹5,999/15, PRO ₹8,999/30; `planFor('UNLIMITED')`, `'FREE'`, `'toString'` → null |
| 1 catalogue | the Pricing page matches the server | pass | `plans.test.js` parses `frontend/src/config/site.ts` and compares |
| 2 allowance | the trial is unchanged | pass | existing trial tests (5 tenders, free re-run, deleted tender keeps its slot, race, per company) green under the new functions |
| 2 allowance | plan limit per period, re-runs free, new period resets, early renewal keeps the period, ended plan → `plan_expired`, race | pass | 7 new `monthly plans` tests in `analysis-budget.test.js` |
| 2 allowance | UNLIMITED has no limit; ACTIVE without a plan or period → trial; CANCELED → trial | pass | 3 tests in `analysis-budget.test.js` |
| 3 API | 402 `plan_exhausted` with the plan message; summary `allowance` for trial and plan | pass | `analysis.test.js`, `dashboard-summary.test.js` |
| 4 ops script | activate / renew / cancel / status behave; bad input refused | pass | local db: Growth activated 12 Oct → 12 Nov; early renew added 12 Nov → 12 Dec and kept the current period; BOGUS plan, renew after cancel, and an unknown company all exit 1; UNLIMITED → unlimited |
| 5 frontend | the notice wording for trial, plan, used-up plan and ended plan | pass | `allowance.test.ts` 5/5 |
| 5 frontend | browser: pricing, FAQ, dashboard states, phone width, CSP | pass | harness, 15/15 (after fixing two artefacts in my own test script: text spacing, and an impossible subscription history I had inserted) |
| 6 search + privacy | pricing description has the new prices; the policy states plan data | pass | served `/pricing` head contains "₹3,999 for 10 tenders"; Privacy "Your plan and usage" item; LAST_UPDATED 12 Oct 2026 |
| 7 docs | architecture, operations, CLAUDE.md updated, with no unintended deletions | pass | `git diff OPERATIONS.md` = only the old 4-line note replaced (a first attempt deleted far more; restored and recorded as lesson 14) |
| 8 live | the deploy is healthy and nothing was mid-analysis | pass | `analyzing_now=0` before the deploy; `flyctl deploy` succeeded (commit 9e71c41) |
| 8 live | real companies keep their trial | pass | `subscription.mjs status` on the server: Skylark free trial 0/5, gem tender free trial 1/5 |
| 8 live | the site shows the new plans; no old prices or GST | pass | tendertez.in/pricing at phone width: Starter ₹3,999/10, Growth ₹5,999/15, Pro ₹8,999/30; no "₹499", "₹1,999" or "GST"; no sideways scroll; FAQ updated; search description updated; privacy "Last updated: 12 October 2026"; no console or CSP errors; analyze without login → 401 |
