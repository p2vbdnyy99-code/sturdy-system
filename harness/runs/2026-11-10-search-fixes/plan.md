# Plan: Search Console fixes (10 Nov 2026), drafted locally

The founder approved drafting both changes locally ("Yes to both, draft them locally"). Evidence is in handoff 54. No commit, push or deploy without the founder's words.

## Part 1: stale tender lists leave the index while their list is stale

- **Evidence (Search Console export):**
  - all 5 "Not found (404)" URLs are tender-list pages that fell below 20 open tenders;
  - 25 of the 26 "Discovered – currently not indexed" URLs are tender lists;
  - tender lists together had 24 impressions and 0 clicks in 3 months.
- **Rule:**
  - A landing page is indexable while its own list (central, state or GeM) is fresh or delayed.
  - When that list is stale or unavailable, the page sends `<meta name="robots" content="noindex">` and is left out of the sitemap. It keeps working for visitors, with its stale notice.
  - When freshness is unknown (no data), behaviour is unchanged.
  - The pages return to the sitemap automatically when the list is fresh again.
- **Also:** /register leaves the sitemap. It stays a public page (counted visits) and isn't marked noindex.
- **Not changed:** the /government-tenders hub (a core page with its own notice), llms.txt, the markdown pages (already `X-Robots-Tag: noindex`), the collector.

| # | Step | Files | Check |
|---|---|---|---|
| 1a | `landingIndexable(page, freshness)` and `indexableLandingPages(facets)` | `src/landingPages.js` | Unit tests: fresh and delayed → indexable; stale and unavailable → not; unknown → indexable; per-list (a stale GeM list doesn't affect a fresh state page) |
| 1b | Landing HTML adds noindex when not indexable | `renderLandingHtml` | Test: stale → meta present; fresh → absent; the page is still rendered with its list |
| 1c | The sitemap route uses `indexableLandingPages`; `sitemapXml` leaves out /register | `server.js`, `src/seo.js` | Tests: sitemap has no /register; the real-app sitemap test still lists landing pages when freshness is unknown or fresh, and none when stale |

## Part 2: corrigendum guide for "meaning" searches

- **Evidence (Search Console export):**
  - 672 impressions, 1 click (0.15%), position 6.8;
  - top queries: "corrigendum meaning in tender" (47), "what is corrigendum in tender" (19), "difference between corrigendum and amendment" (7), "corrigendum issued on gem meaning" (5).
- **Changes:**
  - search title, headline and description lead with the meaning (URL unchanged);
  - the opening answer states the meaning first;
  - two new sections, "Corrigendum vs amendment" and "Corrigendum on GeM", only from primary sources read in full;
  - the guide's checked date changes only if its sources are re-read today.

| # | Step | Files | Check |
|---|---|---|---|
| 2a | Find and read primary sources (official procurement manual or rules on amendment/corrigendum; a public GeM bid corrigendum or GeM document) | scratchpad `sources/` | Each new statement traced to a passage (checks.md) |
| 2b | Draft the guide | `CorrigendumGuide.tsx`, `guides.ts`, `seo.js` (title, headline, description, citations) | geo.test (app and server in step); no unsourced definitions |
| 3 | Verify | — | `verify.sh --checks` |
| 4 | Browser check | local build | Guide at 390 and 1366 px; a stale landing page carries noindex; sitemap content |
| 5 | Docs | BIDPILOT_ARCHITECTURE.md, progress.md, handoff 55 | — |
