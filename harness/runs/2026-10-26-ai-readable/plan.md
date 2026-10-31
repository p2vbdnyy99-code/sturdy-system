# AI-readable site: markdown of every public page, llms.txt, llms-full.txt, ai.txt (26 Oct 2026)

Founder: "OK, A, allow all except Bytespider" (ai.txt restrictions as proposed).
A = markdown made from the pages' own server render (the prerender bundle,
<main> only) by an in-house converter; tender lists, tender search and the
sample analysis render from their data. No commit until the founder says so.

| Step | Files | Output | Check |
|---|---|---|---|
| 1 Core | backend/src/md/{format,htmlToMd,http,registry}.js | registry: route → renderer; listMarkdownRoutes() | unit tests |
| 2 Data renderers | landingPages.js, samplePage.js, md/registry.js | landing (25 tenders, same as HTML), sample (sampleView), search (facets) | tests vs HTML facts |
| 3 Routes | md/router.js, server.js | /x.md, Accept negotiation (q-values; */* → HTML), /api/md/*, /api/md/_catalog, /llms-full.txt, /ai.txt; headers; HEAD/OPTIONS; markdown 404 | curl checklist |
| 4 Site files | seo.js | llms.txt (llmstxt.org sections, .md links), ai.txt (ADF-004 H2 form), robots.txt (search + user bots allowed, training allowed except Bytespider) | tests: names/URL/contact match; "keep in sync" comments |
| 5 Head signals | seo.js | rel=alternate text/markdown, ai-summary meta, global Link describedby | curl/grep |
| 6 Coverage | test/md.test.js | every PUBLIC_PAGES path and every routes.tsx route is rendered, skipped with a reason, or private | test |
| 7 Verify | verify.sh, curl checklist on local server, docs | | all pass |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 674, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 428, fail 0, skipped 27 |
| backend tests: no database | all backend tests pass | pass | pass 348, fail 0, skipped 44 |
| frontend build | type check and build succeed | pass | built in 348ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 57, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
