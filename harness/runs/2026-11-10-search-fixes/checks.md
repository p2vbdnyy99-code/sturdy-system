# Checks: Search Console fixes (written before the work)

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1a | Indexable only while the page's own list is fresh or delayed; unknown keeps today's behaviour | pass | landing-pages.test: fresh and delayed indexable, stale and unavailable not, other lists don't count, unknown indexable; central organisations follow the central list |
| 1b | Stale or unavailable landing page HTML has robots noindex and still shows its list and notice | pass | Unit test, plus the real-app test (collector off means unavailable, so noindex). Local server: stale Maharashtra page has noindex and still lists its tenders; fresh has no noindex. The hub /government-tenders is not noindex. |
| 1c | Sitemap leaves out stale lists and /register; keeps core pages and guides | pass | Stale: 13 URLs, 0 tender lists, no /register. Fresh: tender lists return (4 in the local data). seo.test and landing-pages.test updated. |
| 2a | Every new statement in the corrigendum guide matches a primary source passage | pass | Traceability below |
| 2b | Title, headline and description lead with the meaning; URL unchanged; app and server in step | pass | Title (52 chars) "Corrigendum in a tender: meaning and how to check it"; description 154 chars; H1 and app title equal (geo.test); URL /guides/tender-corrigendum unchanged |
| 4 | 390 and 1366 px: no overflow, no CSP errors, layout shift 0 | pass | sf/check.cjs 22/22 |
| all | Nothing committed, pushed or deployed; no collector, pricing, analytics or database change | pass | Working tree only. The collector and freshness code are unchanged; the rule only reads freshness. |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 755, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 469, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 376, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 243ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 94, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |

## Traceability: corrigendum guide

| Statement | Source |
|---|---|
| Buyers may, before bids are due, "amend tender documents by issuing a corrigendum", on their own or in reply to a bidder's question | Manual for Procurement of Goods 2024 (DoE), para 5.1.5 |
| Corrigenda must be published on the GeM-CPPP portal and the buyer's own website | Manual para 5.1.4(1); GFR 2017 (updated to 31.01.2026) Rule 159(i) |
| After a pre-bid meeting, "a clarification letter and corrigendum to the Tender Document … containing amendments to various provisions of the Tender Document, which shall form part of the Tender Document" | Manual para 5.2.3(e) |
| Significant change or little time left: extend by at least 3 days | Manual paras 5.1.5 and 5.1.6(1) |
| Auto-extension once on GeM or e-procurement when bids are too few; bidders told "due to less competition, the tender closing time has been extended" | Manual para 5.1.6(2) |
| GeM example: Corrigendum No. 1 of 28.03.2023 to GEM/2023/B/3262572; end 29.03.2023 11:00 → 05.04.2023 11:00; opening 11:30 → 11:30 | recpdcl.in PDF, read 10 Nov 2026 |
| IIT Kanpur example (unchanged) | iitk.ac.in corrigendum re-read 10 Nov 2026; matches the guide's table |
| verify.sh | backend 755/469/376, frontend build, lint 0 errors, 94 unit tests, secret scan clean |
