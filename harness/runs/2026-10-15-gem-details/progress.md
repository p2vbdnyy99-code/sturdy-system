# Progress: "Bid details" on GeM tenders (2026-10-15)

## Plan
Steps 1–3 done and verified locally. Not committed or deployed.

## Outputs
- `backend/src/bidpilot/discovery/portals.js` (`bidDetails`),
  `repo/publicTenders.js`, `test/bidpilot/feed.test.js` (17).
- `frontend/src/tenders/TenderBrowser.tsx`, `api/feed.ts`, `pages/Faq.tsx`.
- Browser script (scratchpad): `gem-find-verify.mjs` 16/16.

## Decisions
- The founder declined the paid India server; GeM documents still come from
  GeM itself.

## Open issues
- Searching a bid number on GeM's bid list didn't show the bid for the
  founder; screenshots of GeM's search would show why.

## Next action
Deployed 15 Oct 2026 (commit 832b82d); live checks 14/14 and the live
details link opens with no session. GeM's bid search still needs the
founder's screenshots.
