# Checks: EMD guide update (written before the work)

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Each guide has its own checked date; EMD shows 9 November 2026, the other two 24 October 2026 (byline, sources box, JSON-LD, sitemap, markdown) | pass | Browser: EMD byline 9 Nov; eligibility and corrigendum 24 Oct; /guides shows each guide's own date. Sitemap lastmod 2026-11-09 for EMD, 2026-10-24 for the others. Markdown "Last updated: 2026-11-09". geo.test checks app and server per guide, plus JSON-LD dateModified. |
| 2 | Every new factual statement matches a source passage (traceability table below) | pass | Table below |
| 2 | Worked example arithmetic is right and labelled as worked out from the tender's figures | pass | 4035586 × 2/100 = 80,711.72; the page says the tender "doesn't print the rupee amount, so a bidder works it out" |
| 2 | Nothing presents an expired circular as current (lesson 27); performance security figures are the 01.01.2024 text | pass | 2020 memo still "for tenders issued up to 31 December 2021"; 3–5% and 3–10% from OM F.1/2/2023-PPD of 01.01.2024, read as a scan. A search summary claiming 3–10% for goods was rejected. |
| 2 | The guide still decides nothing for the reader; the bridge box is unchanged | pass | Bridge text unchanged (browser); the example says "read your own tender's clause before relying on an exemption" |
| 3 | The new sources are listed on the page and in the Article citations | pass | Sources list on the page (browser); seo.js citations +3 https URLs (geo.test) |
| 5 | 390 and 1366 px: no overflow (comparison table scrolls or fits), no CSP errors, layout shift 0 | pass | check.cjs 28/28. Page overflow 0. Tables scroll inside `.guide-table` on a phone (202 px, same as the existing exemption table) and fit on desktop. CSP 0, layout shift 0.0000. |
| all | Title, URL and description of the guide unchanged; nothing committed, pushed or deployed | pass | seo.js title and description unchanged; the app summary on /guides and the home page was updated to name the new sections. Working tree only. |

## Traceability (filled during step 2)

| Statement on the page | Source and place |
|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 752, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 466, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 373, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 349ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 94, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| "insurance surety bond … bank guarantee (including an e-bank guarantee) from a commercial bank, or as an online payment" | GFR (updated to 31.01.2026) Rule 170(i), with footnotes 32 (02.02.2022) and 33 (05.08.2022) |
| Valid 45 days beyond final bid validity | Rule 170(i), last sentence |
| Refund by the 30th day after award; two-stage within 30 days of first-stage result | Rule 170(ii) and its inserted text (footnote 34, 01.04.2022) |
| Winner's bid security refunded on receipt of performance security | Rule 171(iii) |
| Bid securing declaration and suspension | Rule 170(iii) |
| Performance security 3–5% for goods, consultancy and non-consultancy services | OM F.1/2/2023-PPD, 01.01.2024, revised Rule 171(i); GFR footnote 35 |
| Works: performance security plus security deposit or retention money 3–10% | Same OM, para 4; GFR footnote 35 |
| Performance security valid 60 days beyond completion, including warranty | Rule 171(ii) |
| Rule 171 names no MSE or startup exemption | Rule 171(i)–(iii) text: none |
| eProcure details page shows "EMD Amount in ₹" | eProcure Tender Details pages (DDA, AAI, BSNL, DMRC) printed by the founder on 9 Nov 2026 |
| AIIMS estimated cost Rs. 40,35,586.00 | NIT11.pdf p.3 (SHA-256 37610702…, same as the stored sample) |
| "2% of the Estimated Value" | NIT11.pdf p.4 |
| "EMD Exemption is not allowed for this work"; performance guarantee 5%, 6 months, EMD forfeited | NIT11.pdf p.12 |
| Security deposit "2.5% of Tendered Value" | NIT11.pdf p.27 |
| verify.sh | backend 752/466/373, frontend build, lint 0 errors, 94 unit tests, secret scan clean |
