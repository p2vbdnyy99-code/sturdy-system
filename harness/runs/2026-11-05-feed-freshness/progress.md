# Progress: feed freshness and monitoring (5 Nov 2026)

## Plan
- Steps 1–8 (workstream 1) done and verified locally; see checks.md.
- Step 9 (research and handoff) next.

## Outputs
- **Backend:**
  - `whatsapp-doc-assistant/backend/src/bidpilot/discovery/freshness.js` (new);
  - `collector.js`, `server.js`, `repo/publicTenders.js`, `landingPages.js`,
    `md/registry.js`, `insights.js`, `routes/insights.js`;
  - `scripts/insights-summary.mjs`.
- **Frontend:**
  - `src/tenders/freshness.ts` (new), `TenderBrowser.tsx`,
    `pages/GovernmentTenders.tsx`, `pages/Insights.tsx`;
  - `api/feed.ts`, `api/insights.ts`, `index.css`.
- **Email:** `marketing/automation/ttm/nightly.py`, `cli.py`.
- **Tests:**
  - `test/bidpilot/freshness.test.js` (new);
  - `test/bidpilot/feed.test.js` (+1);
  - `frontend/src/tenders/freshness.test.ts` (new);
  - `marketing/automation/tests/test_nightly.py` (+7).
- **Browser checks:** `freshness-browser-check.cjs`, `delayed-check.cjs`,
  and the screenshots `landing-*.png`, `search-*.png`, `insights-feed-*.png`.
- **Docs:** `BIDPILOT_ARCHITECTURE.md` (new section), `CLAUDE.md`
  (freshness rule).

## Decisions
- **No schema change.** `discovery_state` already holds `last_success_at`,
  `last_error` and `updated_at`; the time of a failure is `updated_at`
  while `last_error` is set.
- **Nightly script stays deploy-independent.** It emits raw facts only, and
  `nightly.py` classifies them, because the nightly task runs this working
  copy's script against the live code. A sync test keeps the thresholds
  equal.
- **Alert de-duplication** is file-based (the previous night's JSON), so
  it needs no new storage.
- **Landing description.** "updated daily" was removed (a false claim
  while the feed is down).
- **Notice placement.** The stale notice sits just above the tender rows,
  not above the filters; the main search's facets load after the page
  renders, and a notice higher up would shift the page.

## Open issues
- Nothing is deployed; production still says "right now". It changes only
  on the founder's "deploy".
- The nightly email will show the feed card and alert from tonight
  (the task uses this working copy's script and email builder). It was
  checked read-only against production.
- **Monitor memory.** The server monitor remembers statuses in memory; a
  restart logs a continuing failure once more.
- **Stale notice below the fold on phones.** On a phone it sits just
  above the tender rows, below the fold; the count line at the top already
  gives the last update date.

## Next action
Done: research (WS2, WS3) and handoff #20,
`marketing/data/handoff/2026-11-05-20-discovery-stabilisation-and-data-sources.md`.
Stopped. The founder reviews it, then decides on commit, push and deploy,
the collector flag, the NIC email and any Apify pilot.
