# Progress: app restyle after the clinic-OPD reference (2026-10-12)

## Plan
Steps 1–8 done locally. Step 9 (deploy) waits for approval.

## Outputs
- New:
  - `frontend/src/components/AppShell.tsx`, `TenderQueue.tsx`
  - `frontend/src/shell/ShellData.tsx`, `shell/queue.ts` (+ test)
  - `frontend/src/tenderDetail/DatesTimeline.tsx`, `DeadlineCard.tsx`,
    `timeline.ts` (+ test), `deadlineSummary.ts` (+ test)
- Changed: `routes.tsx`, `pages/Dashboard.tsx`, `pages/TenderDetail.tsx`,
  `pages/settings/CompanyProfile.tsx`, `tenderDetail/KeyFacts.tsx`,
  `components/Icon.tsx`, `index.css`
- Removed: `components/AppHeader.tsx` and its CSS
- Docs: `BIDPILOT_ARCHITECTURE.md`, `CLAUDE.md`
- Screenshots (scratchpad): `restyle/before-*`, `restyle/after-*`

## Decisions
- Navy and saffron kept (recommended; the founder didn't ask for green).
- The dark card reports days left and eligibility counts only; no verdict.
- No backend change.

## Open issues
- The queue lists the first 100 tenders (the API cap) with a "See all" link.
- Lint: 11 warnings (10 before); the new provider repeats SessionProvider's
  two patterns.

## Next action
Wait for "commit and deploy". Then commit, push, check nothing is
ANALYZING, deploy, and check the live app at desktop and phone width with a
signed-in account (needs the founder's go-ahead to create a test account,
or the founder checks it themselves).
