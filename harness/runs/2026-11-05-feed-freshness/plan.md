# Run: tender-feed freshness and monitoring (5 Nov 2026)

Task (founder, 5 Nov): stabilise tender discovery after CPPP's relaunch.
Show honest freshness to users, monitor collection failures, and document
whether `BIDPILOT_DISCOVERY_CPPP` disables CPPP safely. Then research
third-party data providers and ePublishing, and report.

Allowed changes:
- backend discovery, freshness, insights and landing/markdown text;
- frontend tender list and insights;
- the nightly email builder;
- tests and docs.

Not allowed:
- a schema change or migration;
- production configuration;
- commit, push or deploy;
- a new scraper, or paid services.

## Facts established before any edit

**One source.** The only discovery source is CPPP: the central, state and
GeM lists all come from it. All three have failed since 23 Oct 15:29 UTC
(note #18). Everything else reads the stored `public_tenders`: the public
search, landing pages, markdown pages, the in-app feed and the
saved-search alerts (`startAlertMatcher`).

**What the flag controls.** `config.bidpilot.discovery.cppp` is read in
exactly two places:
- `startDiscovery()`, which returns a no-op before creating the crawler,
  any timer or any request;
- `routes/feed.js`, which returns `collecting`; no frontend code reads it.

`pruneClosed` runs only inside the crawler, so it stops too when the flag
is off.

**What the stored data already holds.** `discovery_state` has, per list,
`last_success_at`, `last_error` and `updated_at`. Two gaps:
- failed "fresh" pages are never recorded;
- during an outage the fresh queue refills before any sweep runs, so the
  GeM list (sweeps only) never records its failure at all.

**Nightly email constraint.** The nightly email uploads this working
copy's `scripts/insights-summary.mjs` to production and runs it against
the deployed code. It must not import modules that aren't deployed.

## Steps

| # | Step | Files | Output | Check |
|---|---|---|---|---|
| 1 | Freshness rules | new `backend/src/bidpilot/discovery/freshness.js` | `sourceFreshness`, `feedFreshness`, `publicFreshness`, thresholds | unit tests: fresh, delayed, stale, unavailable (switched off, never succeeded, failing), missing timestamps, worst-of |
| 2 | Record every attempt | `collector.js` | fresh success sets `lastSuccessAt` and clears `lastError`; fresh failure records `lastError`; at least one sweep between fresh passes | feed.test: failure recorded, recovery clears it, GeM error recorded during an outage |
| 3 | Server-side alert log | `collector.js` (`startFeedMonitor`), `server.js` | hourly check; one warn per worsening, one info on recovery | unit test of the transition logic (dedup) |
| 4 | Public freshness | `repo/publicTenders.js` (facets), `landingPages.js` (HTML + md), `md/registry.js` | facets carry `freshness`, with no error text; "right now" only when fresh, otherwise "in our last update on …" plus a notice | landing and md tests for fresh and stale |
| 5 | Frontend | new `frontend/src/tenders/freshness.ts`, `TenderBrowser.tsx`, `GovernmentTenders.tsx`, `index.css` | freshness line or notice above the total; count wording | unit tests; browser check at 390 and 1366 px, fresh and stale; existing list browser check |
| 6 | Founder dashboard | `insights.js`, `frontend/src/pages/Insights.tsx` | "Tender feed" card with status, last success, last failure and last error | insights test |
| 7 | Nightly email | `scripts/insights-summary.mjs` (self-contained), `marketing/automation/ttm/nightly.py` and `cli.py` | `feed` in the JSON; a feed card; "Tender feed alert" in the subject only when a source got worse than the previous night (file-based dedup) | python tests; JS sync test of thresholds; read-only production run of the script |
| 8 | Verify and document | `verify.sh`, `BIDPILOT_ARCHITECTURE.md`, `progress.md` | all green | checks.md |
| 9 | Research (WS2, WS3) and handoff | `marketing/data/handoff/` | report #20 | |

## Thresholds (documented here, enforced in `freshness.js` and `nightly.py`)

In normal operation the collector reads a page of some list every 3
seconds. Each list is read at least every few minutes, and failures back
off up to 30 minutes.

| Status | Rule |
|---|---|
| Fresh | last success within 2 hours |
| Delayed | 2 to 24 hours |
| Stale | 24 hours to 7 days |
| Unavailable | switched off, never succeeded, or no success for over 7 days |
