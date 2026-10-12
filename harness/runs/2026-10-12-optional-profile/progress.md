# Progress: company profile optional for the first 2 tenders (2026-10-12)

## Plan
Steps 1–6 done locally. Deploy waits for approval.

## Outputs
- Backend: `src/bidpilot/profileGate.js` (new), `routes/tenders.js`;
  tests `profile-gate.test.js`, `profile-fields-sync.test.js`
- Frontend: `shell/profileGate.ts` (+ test), `components/ProfileRequiredDialog.tsx`
  (new); `shell/ShellData.tsx`, `components/AppShell.tsx`, `auth/CompanyGate.tsx`,
  `api/client.ts`, `pages/Dashboard.tsx`, `dashboard/TenderRow.tsx`,
  `pages/TenderDetail.tsx`, `pages/settings/CompanyProfile.tsx`,
  `pages/Faq.tsx`, `pages/Privacy.tsx`, `index.css`
- Docs: `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md`

## Decisions
- A "try" is a tender (founder's answer), counted by upload. Analysing and
  re-running the first 2 stays free of the profile.
- The dialog can be closed ("Not now"), but the 3rd tender still waits: the
  server refuses it, so "mandatory" holds without trapping the user.
- No migration.

## Open issues
- Skylark already has 2 tenders, so its next upload will show the dialog.

## Next action
Wait for "commit and deploy".
