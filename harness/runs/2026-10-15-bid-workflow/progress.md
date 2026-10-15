# Progress: bid workflow (2026-10-15)

## Plan
All phases built and checked locally: 1 tracker + checklist, 2 corrigenda,
3 clients, 4a portal link + bidding status, 4b NIC draft, 4c tender feed.
Deploy waits for approval.

## Outputs
- Migration `backend/drizzle/0009_melted_sugar_man.sql` (additive).
- Backend: `db/schema/workflow.js`, `clients.js`, `publicTenders.js`;
  `repo/checklist.js`, `repo/corrigenda.js`, `repo/clients.js`;
  `analysis/corrigendum.js`; `discovery/cppp.js`, `discovery/collector.js`;
  `routes/feed.js`; `checklistXlsx.js`; changes in `routes/tenders.js`,
  `routes/companies.js`, `repo/tenders.js`, `profileGate.js`,
  `analysis/eligibilityPipeline.js`, `analysis/pipeline.js`, `config.js`,
  `server.js`.
- Frontend: `pages/Clients.tsx`, `pages/Feed.tsx`, `tenderDetail/BidPanel.tsx`,
  `ChecklistTab.tsx`, `CorrigendaTab.tsx`, `AttachDocumentNotice.tsx`,
  `stages.ts`, `biddingStatus.ts`; `api/clients.ts`, `api/feed.ts`; changes in
  tender page, dashboard, queue, profile page, routes, rail, CSS, FAQ,
  privacy.
- Tests: `bid-workflow`, `corrigendum`, `clients`, `feed`, `stages-sync`;
  frontend `biddingStatus`, `deadlineSummary` (+1).
- Gmail draft to support-eproc@nic.in.

## Decisions
See plan.md "Decisions during the run".

## Open issues
- Collector off until the founder switches it on (BIDPILOT_DISCOVERY_CPPP=on).
- Coverage: newest CPPP tenders only, from the day collection starts.
- Lint 15 warnings (11 before): the same load-in-effect pattern as existing pages.
- Privacy date must be the deploy day.

## Next action
Wait for "commit and deploy". Then: check nothing is ANALYZING; apply 0009
in the machine before deploying (additive, so the running code is
unaffected); deploy; check live; switch the collector on only if the founder
says so.
