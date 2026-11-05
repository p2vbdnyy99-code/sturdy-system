# Progress: Phase 1 measurement and technical improvements

## Plan
- Stage A (list-page layout shift): done, verified (checks.md).
- Stage B (founder exclusion): done, verified.
- Stage C (plan clicks + GA4 events): done, verified.
- Stage D (home links to guides): done, verified.
- Docs: BIDPILOT_ARCHITECTURE.md section; CLAUDE.md analytics rule (events + team exclusion).
- Not done, by instruction: commit, push, deploy.

## Outputs
- Stage A:
  - backend `src/dataBlock.js` (new), `src/landingPages.js`, `src/samplePage.js` (uses the shared helper), `server.js`, `test/landing-pages.test.js`;
  - frontend `src/tenders/landingData.ts` (new), `src/pages/GovernmentTenders.tsx`, `src/tenders/TenderBrowser.tsx`, `src/routes.tsx`;
  - checks: `list-browser-check.cjs`.
- Stage B:
  - backend `src/bidpilot/staff.js` (new), `src/bidpilot/visits.js`, `src/bidpilot/routes/auth.js` (/me sets the marker), `server.js`, `test/bidpilot/staff.test.js` (new), `test/bidpilot/insights.test.js`;
  - frontend `src/api/visits.ts` (credentials same-origin), `src/pages/Privacy.tsx` (team cookie, team visits not counted);
  - checks: `staff-browser-check.cjs`.
- Stage C:
  - backend `src/bidpilot/conversions.js` (new), `src/bidpilot/ga4.js` (buildEvent, event sender), `src/bidpilot/visits.js` (plan-click route, visitorOf), `src/bidpilot/routes/auth.js` (sign_up: password, Google, phone), `src/bidpilot/routes/tenders.js` (upload: dashboard, tracked tender), `src/bidpilot/analysis/pipeline.js` (analysis_complete), `server.js`, `test/bidpilot/conversions.test.js` (new);
  - frontend `src/api/visits.ts` (recordPlanClick), `src/pages/Pricing.tsx`, `src/dashboard/TenderRow.tsx`, `src/dashboard/ReadyToAnalyse.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Privacy.tsx`;
  - checks: `conversions-browser-check.cjs` (with a local GA4 capture server).
- Stage D: frontend `src/pages/Home.tsx`, `src/index.css` (`.home-teasers-3`); screenshots `home-guides-*.png`.
- Measurements: `measurements/*.json`.

## Decisions
- The list pages' server HTML is kept as it is (crawler list, other-lists links, CPPP credit). The app gets its data in a JSON block, rather than server-rendering the app page as on the sample page, because the app page lacks the other-lists links.
- `GovernmentTendersRoute` keys the page by path, which fixes a pre-existing stale-state bug the change would have made worse.

## Open issues
- The main search `/government-tenders` has CLS 0.095–0.10 on the original code too ("needs improvement"). Out of this stage's scope; reported.
- The local measurement uses seeded synthetic tenders (shorter list than production). Live re-measure after deploy.

- Stage B limits: pages a team member views on a new browser before signing in there once are still counted. The policy's LAST_UPDATED must be set to the deploy day.

- Stage C limits: GA4 is not read back from here (no GA4 access); the events were verified against a local capture of exactly what would be posted. After deploy, check GA4 Realtime once, then mark the four events as key events in GA4 (founder, GA4 admin). A team member's very first visit on a new browser, before signing in there, is still counted and can send plan_click.

## Before deploy (only on the founder's "deploy")
1. Set `LAST_UPDATED` in `frontend/src/pages/Privacy.tsx` to the deploy day.
2. Check no tender is ANALYZING.
3. Deploy, then live checks:
   - list-page CLS (Lighthouse and the trace);
   - the data block present;
   - a test visit as a team browser not counted;
   - a plan click recorded;
   - GA4 Realtime shows the events.

## Review fixes (4 Nov 2026, approved by the founder)
- M1, M2 and L1 from the final review are fixed; the missing tests are added (see checks.md rows "R").
- Remaining limit from M1: the team-tender list is in memory, so a restart between a team upload and the end of its analysis would let that one analysis_complete through.
- Nothing committed, pushed or deployed.

## Release v54 (4 Nov 2026, 22:40 IST; founder's "deploy" and "push")
- Commits: 43ae575 (Phase 1 + review fixes) and 2f1affc (privacy LAST_UPDATED = 4 November 2026), pushed as a fast-forward; GitHub = local = 2f1affc.
- Before: verify.sh 744/458/366, build, lint 0 errors (18 warnings), unit 78, secret scan clean; production 0 ANALYZING and 0 being read (checked twice).
- Deploy: `flyctl deploy` -> v54, machine started; log: GA4 page views and conversion events on. Rollback: v53.
- Live, Lighthouse mobile x3: state/maharashtra CLS 0.000 (perf 91/98/99); organisation/nrrda CLS 0.000 (perf 100/98/99); a11y 96, best practices 96 (the signed-out 401 from /bidpilot/me, also on v53). Before: 0.308.
- Live browser (live-phase1 check, 18/18): server HTML has the landing-data block; first load makes no list/facets request; the block is removed after use; back to the list fetches it fresh; no page errors or CSP violations; visit beacons carry the site cookies; Choose Starter still opens the email; plan click beacon sent; privacy shows 4 November 2026, the signed-in/page-view wording, the four events and "up to 400 days".
- Production rows (read-only): the team-marked browser's tagged visits and plan click: 0 rows; untagged list visits from the marked browser: 0; the ordinary test visitor: 2 rows (/pricing and /plan-click/starter, campaign livecheck1715-visitor). These 2 are test rows.
- Logs since deploy: no application errors. Pre-existing and unrelated: the CPPP feed read has answered 404 since at least 3 Nov 17:18 UTC.
- Pending: GA4 Realtime check by the founder (page_view and plan_click from the test visitor); sign_up/upload/analysis_complete need a production test account (founder's approval).

## Next action
Founder review of Phase 1 with the review fixes. Then "commit" / "push" / "deploy" as they choose. Phase 2 (EMD exemption checker) waits for approval.
