# Analysis starts by itself after upload, and a first-run dashboard

Task (founder, 29 Oct 2026): implement backlog item 1 of the growth audit
(analysis starts automatically when a tender's PDF has been read) and item 2
(a first-run dashboard), with tests. No deploy, no commit until asked.

Evidence: in the 30 days to 29 Oct, 2 of 5 uploaded tenders waited at the
Analyze click (production `visits-report.mjs`, read-only).

## Current call sequence (read before editing)

- `POST /tenders/upload` (`routes/tenders.js` handleUpload): session, CSRF,
  `requireCompanyAccess`, `refuseIfProfileNeeded`, `ingestUpload`, 201, then
  `setImmediate(processExtraction(scope, id, buffer))`.
- `POST /tenders/:id/document` (feed tender): same checks, then
  `processExtraction`.
- `processExtraction` (`ingestion/pipeline.js`): PROCESSING, EXTRACTING,
  pages, COMPLETED (or FAILED). Nothing starts analysis.
- `POST /tenders/:id/analyze`: `getTender` (404), document present (409
  no_document), `refuseIfProfileNeeded(tenderId)` (409 profile_incomplete),
  processing COMPLETED (409), chunk count, `assertAnalysisBudget` (413 too
  large, 429 daily caps), `claimTenderSlot` (402 trial/plan; idempotent per
  tender; company row lock), `startAnalysis` compare-and-set (409 when already
  ANALYZING), 202, `setImmediate(runAnalysis)`.

## Decisions

- One shared operation, `startTenderAnalysis(db, scope, tenderId)` in
  `analysis/start.js`, holds the checks above in the same order. The route
  maps its refusal to the same HTTP status and code as today.
- Consent: the server starts analysis automatically only when the upload
  request says `autoAnalyze=1`. The app sends it only from the upload button
  whose text says, from the live allowance, that the tender will be analysed
  automatically and uses 1 of the remaining free (or plan) tenders. API
  callers and older pages keep the explicit Analyze click.
- Auto-start runs only when extraction COMPLETED and analysis is still
  NOT_STARTED, through the shared operation. A refusal (profile, trial, plan,
  daily cap, too large, already running) leaves the tender as it is today:
  ready to analyse, nothing claimed. It never throws into extraction.
- The dashboard says why a ready tender wasn't started (profile, trial,
  plan) from the same checks (`profileNeededFor`, `getEntitlement`, slot),
  with the next step.
- Operational switch `BIDPILOT_AUTO_ANALYZE=off` turns auto-start off without
  a deploy of code (default on). No schema change, no migration.

## Steps

| # | Step | Files | Output | Check |
|---|---|---|---|---|
| 1 | Shared start operation; analyze route uses it | `analysis/start.js` (new), `routes/tenders.js` | Route behaviour unchanged | Existing analysis, profile-gate, feed tests pass unchanged |
| 2 | Auto-start after extraction when the upload asked for it | `ingestion/pipeline.js` (`onCompleted` hook), `routes/tenders.js` (upload + attach), `config.js` | Analysis starts with no click | New tests 1–9 below |
| 3 | Why-not-started reasons and upload limit in the dashboard summary | `routes/dashboard.js`, `analysis/start.js` | `readyToAnalyse[].blockedBy`, `uploadLimitMb` | dashboard-summary test |
| 4 | Clear messages: file too large, not ready, already running | `routes/tenders.js` | Plain text, codes | Tests assert message and code |
| 5 | Frontend: disclosure, first-run panel, ready-box reasons, already-running handling, polling grace tick | `pages/Dashboard.tsx`, `dashboard/firstRun.ts` (new), `dashboard/ReadyToAnalyse.tsx`, `dashboard/TenderRow.tsx`, `dashboard/useTenderPolling.ts`, `api/tenders.ts`, `index.css` | First-run panel; consent text | `firstRun.test.ts`; browser check |
| 6 | Verify and document | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, FAQ/Privacy wording check, progress.md | verify.sh table | All rows pass |

## Tests (written before the code)

1. Upload with `autoAnalyze=1` → extraction COMPLETED → analysis COMPLETED, one trial slot.
2. Calling the auto-start twice (sequential and concurrent) → one run, one slot.
3. Two concurrent starts (auto + explicit) → one ANALYZING, one slot.
4. 4th tender without a profile (made by a feed attach) → not started; blockedBy profile_incomplete.
5. Trial exhausted → not started, NOT_STARTED, no usage row; blockedBy trial_exhausted.
6. Paid plan → plan_tender usage, trial untouched; plan_exhausted refused.
7. AI failure → FAILED with a message; Retry via explicit analyze works.
8. Retry after failure does not take another slot.
9. Explicit Analyze route: existing tests unchanged; upload without the flag does not auto-start.
10. First-run panel only when the company has no tenders and the summary has loaded (unit test of `isFirstRun`).

## Fixes from the pre-release review (29 Oct 2026)

| Finding | Fix | Check (written first) |
|---|---|---|
| I1 | The app sends `autoAnalyze=1` only when the setting is on, the summary has loaded, the shown allowance isn't used up, and a fresh allowance read just before upload agrees (same kind, not used up). The message after upload follows what was actually sent and never says the analysis will start when the user was told it won't. | `firstRun.test.ts`: exhausted trial / plan / ended plan → not requested; eligible → requested; allowance changed between showing and upload → not requested; messages for each case. Backend HTTP: exhausted trial and exhausted plan uploads without the flag are read, not started, no slot. Browser: trial-used-up upload sends no flag and the message says it won't be analysed; a server-side refusal (daily cap) leaves an accurate next step. |
| M1 | Re-read the allowance (`GET /dashboard/summary`) right before the upload request; notice wording says "if you still have one then" (no guarantee). | unit tests above; browser check |
| M2 | Tender page shows the stored restart-recovery message with the right next step; other failures keep the plain "could not be read" text. | `processingFailure.test.ts`; backend test that the frontend copy of the recovery message matches `recovery.js` |
| M4 | `BIDPILOT_AUTO_ANALYZE` off for off/false/0/no (any case, trimmed); on when unset. | config unit test |
| M6 | The attach-PDF route never starts analysis by itself (no disclosure on that form): it ignores the flag. | HTTP test: without flag → manual; with flag → still manual; another company → refused |
| M3 (optional) | Full-list row for a never-analysed tender shows the plan/contact next step when the allowance is used up, instead of Analyze. | `firstRun.test.ts` rowBlockedBy; browser check |
