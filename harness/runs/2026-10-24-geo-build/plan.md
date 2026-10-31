# Build the approved SEO/GEO site changes (24 Oct 2026)

Approved by the founder ("Approve", 24 Oct) from
`marketing/seo/geo-plan-2026-10-24.md`: Q1 server-rendered text on the core
pages, Q4 titles and descriptions, Q5 brand sentence, Q6 Kerala merge, Q7
sitemap dates, S5 AI-crawler counter, and a Guides section with P4–P6 (with
Article and BreadcrumbList data). Commit and deploy wait for the founder's
own "commit" / "deploy". P1–P3 and FAQPage/Organization data are not in this
change.

| Step | Files | Output | Check |
|---|---|---|---|
| 1 Titles, descriptions, brand sentence | `backend/src/seo.js`, `frontend/src/pages/Home.tsx`, `About.tsx` | New head tags; one-sentence definition in the first paragraph | seo.test.js length checks; C1 |
| 2 Kerala merge | `repo/publicTenders.js`, `landingPages.js`, `server.js` | One Kerala list (both CPPP spellings); `/state/keralam` 301 | C2, C3 |
| 3 Guides | `frontend/src/pages/guides/*`, `routes.tsx`, `PublicLayout.tsx`, `seo.js` | `/guides` + 3 guides, footer link, Article + BreadcrumbList JSON-LD | C4, C5 |
| 4 Server-rendered public pages | `frontend/src/prerender.tsx`, `frontend/scripts/prerender.mjs`, `package.json`, `seo.js`, `server.js` | `dist/prerender.json` from the real React pages; served inside `#root` | C6, C7 |
| 5 Sitemap dates | `seo.js`, `server.js` | `<lastmod>` on landing pages (today, IST) and guides (checked date) | C8 |
| 6 AI-crawler counter | schema + migration, `bidpilot/crawlers.js`, `server.js`, `insights.js`, `Insights.tsx` | Daily count per bot and page, no IP; card on /insights | C9, C10 |
| 7 Verify and document | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md` (migration) | verify.sh table, browser check | all |
