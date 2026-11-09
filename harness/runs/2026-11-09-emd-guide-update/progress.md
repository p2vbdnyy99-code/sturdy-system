# Progress: EMD guide update

## Plan
Steps 1–5 done; step 6 (docs) done with this file. Nothing committed, pushed or deployed.

## Outputs
- Code: `frontend/src/guides/guides.ts`, `pages/guides/{EmdGuide,GuideLayout,Guides,EligibilityGuide,CorrigendumGuide}.tsx`,
  `index.css`, `backend/src/seo.js`, `backend/src/md/registry.js`, `backend/test/geo.test.js`.
- Sources read: scratchpad `sources/` (GFR updated to 31.01.2026, OM of 01.01.2024, AIIMS NIT11).
- Checks: checks.md (all pass); browser script in scratchpad `emd/`.

## Decisions
- Per-guide checked dates, so updating one guide doesn't claim the others were re-read.
- The guide's title, URL and meta description are unchanged (it already ranks). Only the app summary on /guides and the home page names the new sections.
- New topics went into the existing guide, not new thin pages.

## Open issues
- None. The tables scroll sideways inside their box on phones, as the existing table already did.

## Next action
Founder review; ship on "commit", "push" and "deploy".
