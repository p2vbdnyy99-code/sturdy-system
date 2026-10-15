# Progress: tender search (2026-10-15)

## Plan
All 8 steps done and verified locally. Not committed or deployed.

## Outputs
- Backend: `discovery/cppp.js` (3 lists), `discovery/portals.js`,
  `discovery/collector.js` (fresh pass + saved sweep), `repo/publicTenders.js`,
  `routes/publicTenders.js`, `routes/feed.js`, `config.js`, `server.js`,
  schema `publicTenders.js`, migration `0010_third_cardiac.sql`.
- Tests: `test/bidpilot/feed.test.js` (16), fixtures `test/fixtures/cppp/`,
  table count 31, `truncateAll`.
- Frontend: `api/feed.ts`, `tenders/TenderBrowser.tsx`, `tenders/browse.ts`
  (+ test), `tenders/SourceNote.tsx`, `pages/GovernmentTenders.tsx`,
  `pages/Features.tsx`, `pages/Feed.tsx`, `pages/Home.tsx`,
  `components/PublicLayout.tsx`, `routes.tsx`, `index.css`, FAQ, privacy.
- Browser script: scratchpad `tender-search-verify.mjs` (29/29).

## Decisions
- No session-bound CPPP link is stored; central and state rows show the
  tender ID and the portal's search page; GeM keeps its stable link.
- Public search at `/government-tenders` (the app already uses
  `/tenders/:id`), no sign-in, 60 requests a minute per IP.
- IREPS is not read (robots.txt forbids it); no competitor data is copied.
- Closed tenders are kept 60 days.
- The privacy date stays 15 October 2026 if this goes live today;
  otherwise change it to the deploy day.

## Open issues
- CPPP's copyright policy asks for permission to reproduce its material.
  The NIC draft asks for it; it is the founder's decision whether to go live
  before a reply.
- Central and state tenders can't be opened directly (portal captcha), only
  found by tender ID on the portal's search page.
- A full pass of all lists takes about 14 hours, so after deploying the
  search fills up over the first day.

## Next action
Deployed 15 Oct 2026 (commit f87ef35), migration 0010 applied before the
deploy, the collector sweeping. In a day: check the logs for `read failed`,
the counts per list, and the database size (expect ~150 MB at full
coverage). The privacy date 15 October 2026 is the go-live day.
