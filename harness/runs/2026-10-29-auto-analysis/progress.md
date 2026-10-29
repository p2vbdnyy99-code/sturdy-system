# Progress

## Plan
- Steps 1–6 done (plan.md). Nothing committed, pushed or deployed.

## Outputs
- Backend: `analysis/start.js` (new), `routes/tenders.js`, `routes/dashboard.js`,
  `ingestion/pipeline.js`, `analysis/budget.js`, `analysis/pipeline.js`,
  `config.js`; test `test/bidpilot/auto-analysis.test.js` (new).
- Frontend: `dashboard/firstRun.ts` + test, `dashboard/FirstRun.tsx` (new),
  `dashboard/ReadyToAnalyse.tsx`, `dashboard/TenderRow.tsx`,
  `dashboard/useTenderPolling.ts`, `pages/Dashboard.tsx`,
  `pages/TenderDetail.tsx`, `api/dashboard.ts`, `api/tenders.ts`, `index.css`.
- Docs: `BIDPILOT_ARCHITECTURE.md` section, `OPERATIONS.md`, `CLAUDE.md`
  (rule + lesson 30). checks.md all pass.

## Decisions
- Consent is a request flag (`autoAnalyze=1`) sent only while the notice is
  shown, not a stored setting: no schema change, no migration, and API
  callers keep the Analyze click.
- Only NOT_STARTED tenders start by themselves; FAILED ones wait for Retry.
- Why-not-started is recomputed for the dashboard (profile, trial, plan),
  not stored; daily caps are reported when Analyze is clicked.
- The feed's attach-document form does not send the flag yet (its page has
  no allowance notice); the route supports it.
- No privacy-policy change: no new data is collected or stored.

## Open issues
- If the server restarts between reading and the automatic start, the
  tender is left ready to analyse (extraction itself is marked failed by
  recovery only when it was mid-read). Same in-process limit as before.
- Polling waits up to 4 s after a tender is read before showing it as ready.

## Next action
- Founder's go-ahead to commit and deploy. Before deploying: check no tender
  is ANALYZING; no migration. After: upload one real tender on a test
  account in production and confirm it is analysed with no click, and that
  `metric bidpilot_auto_analysis outcome=started` is in the log.

## Review fixes (29 Oct, after the pre-release review)
- I1 fixed: `shouldRequestAutoAnalysis` + `afterUploadMessage` (firstRun.ts);
  Dashboard re-reads the allowance before upload (M1).
- M2 fixed: `tenderDetail/processingFailure.ts`.
- M4 fixed: config accepts off/false/0/no.
- M6 fixed: attach route ignores the flag; HTTP tests added.
- M3 (optional) fixed: row offers the plans when the allowance is used up.
- M5 (413 → 400 for a non-size multer error) left as is: documented, no
  caller depends on it.
- Not committed. Next: founder reviews the diff; commit only after that.

## Consent boundary (29 Oct)
- Expected allowance kind sent with the upload, stored as an
  `auto_analysis_requested` tender event (no migration), compared with the
  entitlement inside the slot lock; `allowance_changed` refusal recorded and
  shown on the dashboard with the current allowance and Analyze.
- All checks pass (checks.md "boundary" rows). Not committed.
- Next: founder reviews the diff, then "commit"; deploy separately.
