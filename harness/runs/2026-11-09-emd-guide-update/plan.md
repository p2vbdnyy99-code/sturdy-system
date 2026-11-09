# Plan: EMD guide, how to work out EMD, and performance security vs EMD (9 Nov 2026)

**Task:** founder said "next" after v57. This is growth sprint step 4: improve the page that already gets search traffic.

- The EMD guide got 16 of 26 Google visitors in the 30 days to 9 Nov.
- Add the founder's topics "how to calculate EMD" and "performance security versus EMD" as sections of that guide, not as thin new pages.
- Local only. No commit, push or deploy without the founder's words.

## Sources, read in full on 9 Nov 2026 (copies in scratchpad `sources/`)

1. **General Financial Rules 2017, updated up to 31.01.2026** (doe.gov.in): Rule 170 (bid security: who is exempt, 2–5%, accepted forms including insurance surety bonds and e-bank guarantees, 45-day validity, refund by the 30th day after award, (iii) bid securing declaration) and Rule 171 (performance security, as amended).
2. **DoE OM No. F.1/2/2023-PPD, 01.01.2024** (scanned; read as an image): Rule 171(i) performance security is 3–5% of contract value for goods, consultancy and non-consultancy services. Para 4: for works, performance security plus security deposit or retention money continues at 3–10%. It supersedes the OM of 29.12.2023.
   - One search summary said "3–10% for goods". That was wrong; the primary text says 3–5%.
3. **AIIMS Bhubaneswar NIT 11/2026**, the sample's own tender. Its SHA-256 matches the stored sample. Used for the worked example:
   - p.3: estimated cost Rs. 40,35,586.00;
   - p.4: "Earnest Money 2% of the Estimated Value";
   - p.12: "EMD Exemption is not allowed for this work", a 5% performance guarantee valid 6 months beyond completion, and EMD forfeited if it is not deposited;
   - p.27: security deposit 2.5% of tendered value.

## Steps

| # | Step | Files | Output | Check |
|---|---|---|---|---|
| 1 | Give each guide its own "sources checked" date. EMD = 2026-11-09; the others stay 2026-10-24. | `frontend/src/guides/guides.ts`, `GuideLayout.tsx`, `Guides.tsx`, `backend/src/seo.js`, `backend/src/md/registry.js`, `test/geo.test.js` | Per-guide date in the byline, sources box, Article `dateModified`, sitemap `lastmod` and markdown `Last updated` | geo.test: app and server dates equal per guide; sitemap and JSON-LD per guide |
| 2 | EMD guide content | `EmdGuide.tsx` | Updated "What is EMD" (forms, refund); new "How to work out the EMD amount" with the AIIMS worked example; new "Performance security and EMD: the difference" table; Rule 170(iii) added to the declaration section; 2 FAQ answers; 1 mistake added; 3 sources added | Each new statement traced to a source page (table in checks.md); arithmetic checked (2% × 40,35,586.00 = 80,711.72) |
| 3 | Citations | `backend/src/seo.js` | EMD guide `citations` include the 3 new sources | geo.test: citations are https |
| 4 | Verify | — | `verify.sh --checks` | All pass |
| 5 | Browser check | local build | 390 and 1366 px: new sections, table readable on a phone, byline date, other guides keep their date, no overflow, CSP, layout shift | All pass |
| 6 | Document | BIDPILOT_ARCHITECTURE.md, progress.md, handoff | — | — |

**Not changed:** the guide's title, URL and description (it already ranks); pricing; analytics; any other page.
