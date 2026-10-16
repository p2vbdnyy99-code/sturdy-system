# Plan: public sample analysis (16 Oct 2026)

Founder's request: "build the public sample analysis" (row 5 of
`marketing/growth-plan.md`; one AI run approved). Commit/deploy only on the
founder's word.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Pick a public tender | — | a full, text-based tender PDF on the buyer's own site | 20+ pages, text extractable, has EMD/eligibility/BOQ; opens without cookies |
| 2 | One real analysis, no DB writes | `backend/scripts/sample-analysis-run.mjs` (run in the Fly machine) | JSON of the standard pipeline's output | PDF hash pinned; 0 failed chunks; nothing written |
| 3 | Check the output before publishing | — | every quote checked against `pdftotext` of its cited page; no personal data | all items on their cited page (table wraps explained) |
| 4 | Store and serve | `backend/src/sample/*.json`, `src/samplePage.js`, `seo.js`, `visits.js`, `server.js`, `repo/checklist.js` (exports) | `/sample-analysis` server HTML + `/bidpilot/public/sample-analysis` | `sample-page.test.js`: shown unchanged, checklist = distinct requirements, pages 1–35, head tags, sitemap/visits/GA4, real app |
| 5 | Page and links | `frontend/src/pages/SampleAnalysis.tsx`, `api/sample.ts`, `routes.tsx`, `Home.tsx`, `Pricing.tsx`, `index.css` | the page, home + pricing links | browser 20/20 at 375 px and desktop |
| 6 | Verify and document | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md`, growth plan | | `verify.sh --checks` |
