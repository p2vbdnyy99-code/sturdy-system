| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Analyze route uses the shared operation; existing analyze, profile-gate and feed tests pass unchanged | pass | analysis, profile-gate, feed, upload, analysis-budget, dashboard-summary: pass 109, fail 0, no test edited |
| 2 | Upload with consent → analysis starts and completes with no click, one trial slot | pass | auto-analysis.test.js "an upload that asked for it…" |
| 2 | Repeated auto-start (sequential and concurrent) → one run, one slot | pass | three at once + one after: 1 started, 1 slot, 1 AI call |
| 2 | Auto + explicit start at the same time → one ANALYZING, one slot | pass | exactly one of auto/click started; click gets 409 already_running; 1 slot |
| 2 | Profile needed → not started, recoverable | pass | code profile_incomplete, NOT_STARTED, 0 slots; 202 after completeProfile |
| 2 | Trial exhausted → not started, no usage row | pass | code trial_exhausted, usage rows unchanged, 0 AI calls; click 402 |
| 2 | Paid plan uses plan_tender, trial untouched; plan exhausted refused | pass | plan_tender 1, trial_tender 0; 11th → plan_exhausted |
| 2 | AI failure → FAILED with message; retry works without another slot | pass | FAILED, plain message, not auto-retried; retry COMPLETED, still 1 slot |
| 2 | Upload without consent flag does not auto-start | pass | NOT_STARTED, 0 slots, 0 AI calls; Analyze 202; switch off ignores the flag |
| 3 | Summary gives blockedBy reasons and the upload limit | pass | blockedBy null / profile_incomplete / trial_exhausted / plan_exhausted; upload.maxMb, upload.autoAnalyze |
| 4 | File-too-large, not-ready and already-running messages are plain and coded | pass | file_too_large "50 MB limit"; not_ready without status names; not_readable; already_running; company cap message |
| 5 | First-run panel only for a company with no tenders (unit test) | pass | firstRun.test.ts 7/7 |
| 5 | Browser: first-run panel, consent text, upload → analysed with no click | pass | local server, stand-in AI, 390 + 1366 px: 32/32; trial-used case 5/5; screenshots auto-*.png in the session scratchpad |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 705, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 438, fail 0, skipped 29 |
| backend tests: no database | all backend tests pass | pass | pass 356, fail 0, skipped 46 |
| frontend build | type check and build succeed | pass | built in 277ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 66, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| fix I1 | Used-up trial / plan / ended plan never asks for the automatic start; message after upload agrees with the notice | pass | firstRun.test.ts (request rule, messages); auto-analysis.test.js exhausted trial and plan: read, NOT_STARTED, no slot, also with a stale flag; browser: autoAnalyze=false, "it will be read but not analysed", 5 slots unchanged |
| fix I1 | Eligible user under an accurate notice asks for it; a server refusal leaves an accurate next step | pass | browser: autoAnalyze=true, message "if your allowance and today's limits allow … next step if it couldn't start"; refused by the company limit → NOT_STARTED, 0 slots, Analyze shows "today's analysis limit … stays ready" |
| fix M1 | Allowance re-read before upload; changed or unknown → no request; notice never promises a slot | pass | firstRun.test.ts (8 changed/unknown cases); browser: 5 left shown, used up before upload → autoAnalyze=false, NOT_STARTED, no slot |
| fix M2 | Restart-interrupted read shows the stored message and the right step | pass | processingFailure.test.ts 2/2; recovery.test.js copy check; browser 1/1 |
| fix M4 | off/false/0/no (any case, trimmed) switch off; unset on | pass | auto-analysis.test.js config test |
| fix M6 | Attach route: manual with or without flag; company access enforced | pass | auto-analysis.test.js: NOT_STARTED, 0 slots, 0 AI calls, Analyze 202; 403 / 404 for another company, nothing attached |
| fix M3 | Blocked never-analysed row offers plans, not Analyze | pass | firstRun.test.ts rowBlockedBy; browser: row has See the plans, no Analyze |
| fix verify | verify.sh after the fixes | pass | backend 710/439/357, build, lint 0 errors (19 warnings), unit 73, secret scan clean; end-to-end browser 32/32 |
| boundary | Same allowance kind at upload and start → analysed | pass | auto-analysis.test.js; browser end to end 32/32 |
| boundary | Trial → plan, plan → another plan, trial ran out: no start, no slot | pass | auto-analysis.test.js (allowance_changed ×2, trial_exhausted), slots 0 |
| boundary | Missing / invalid / untrue kind authorises nothing | pass | no_request ×2, trial company claiming unlimited → allowance_changed; HTTP 1/true/plan:Platinum → autoAnalyze false |
| boundary | Manual Analyze afterwards under current checks | pass | 202 → plan_tender 1; browser: ready box shows reason + current allowance, Analyze → plan slot |
| boundary | Concurrent starts ≤ 1 slot | pass | two automatic + click against a changed allowance → 1 plan slot (click); earlier concurrency tests unchanged |
| boundary | Restart mid-read fails closed | pass | recovery → FAILED, automatic start not_applicable, 0 slots |
| boundary | verify.sh | pass | backend 717/439/357, build, lint 0 errors (19 warnings), unit 75, secret scan clean |
