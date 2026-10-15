# Progress: GeM bid documents (2026-10-15)

## Plan
Steps 1–3 done and verified locally. Not committed or deployed.

## Outputs
- `backend/src/bidpilot/discovery/gemDocument.js`, `routes/publicTenders.js`
  (document redirect), `repo/publicTenders.js` (`documentUrl`),
  `discovery/portals.js` (label), `test/bidpilot/feed.test.js` (18),
  `test/fixtures/cppp/gem-view.html`.
- `frontend/src/tenders/TenderBrowser.tsx`, `api/feed.ts`,
  `pages/GovernmentTenders.tsx`, `pages/Faq.tsx`, `index.css`.
- Browser script: scratchpad `gem-doc-verify.mjs` (10/10).

## Decisions
- Our server finds the document link (one read of the bid's public CPPP GeM
  page per click, cached) and redirects; GeM serves the PDF to the user.
- Same tab on touch phones, new tab on computers.

## Open issues
- GeM's PDF server can't be reached from outside India, so whether the PDF
  opens on the founder's phone can only be confirmed by the founder.

## Next action
Deployed 15 Oct 2026 (commit 69301d0); live checks 9/9. Waiting for the
founder to tap "Bid document (PDF)" on a GeM bid on their phone and say
whether the PDF downloads.
