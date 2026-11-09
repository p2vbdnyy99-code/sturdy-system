# Progress: Search Console fixes

## Plan
Parts 1 and 2 done and verified; docs written. Nothing committed, pushed or deployed.

## Outputs
- Part 1: `backend/src/landingPages.js` (landingIndexable, indexableLandingPages, noindex in renderLandingHtml), `backend/server.js` (sitemap), `backend/src/seo.js` (/register left out), tests in `test/landing-pages.test.js`, `test/seo.test.js`.
- Part 2: `frontend/src/pages/guides/CorrigendumGuide.tsx`, `frontend/src/guides/guides.ts`, `backend/src/seo.js` (title, headline, description, citations, checked 2026-11-10), `test/geo.test.js`, `marketing/seo/pages/P6-guide-tender-corrigendum.md` (note).
- Sources: scratchpad `sources/` (Manual_Goods_2024.pdf, GFR, RECPDCL GeM corrigendum, IIT Kanpur corrigendum). Browser script: scratchpad `sf/`.

## Decisions
- Indexability follows each page's own list. Unknown freshness keeps today's behaviour, so tests without data still pass and nothing changes if freshness can't be read.
- The /government-tenders hub stays indexable: it is a core page with its own notice.
- /register stays a public page (visits counted), only out of the sitemap.
- The corrigendum guide's sources were all re-read today, so its date moves to 10 Nov; the eligibility guide keeps 24 Oct.

## Open issues
- None.

## Next action
Founder review; ship on "commit", "push" and "deploy". After deploy: request recrawl of the corrigendum guide in Search Console (URL Inspection, then Request indexing).
