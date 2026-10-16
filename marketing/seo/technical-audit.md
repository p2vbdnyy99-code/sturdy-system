# Technical SEO audit: https://tendertez.in (16 Oct 2026)

Measured with `python3 -m ttm seo-audit` (reads the server's HTML; does not run
JavaScript) and curl from this cloud session (not from India, so timings are
indicative only). Nothing here is estimated. Re-run any time:
`cd marketing/automation && python3 -m ttm seo-audit`.

## Results

| Check | Result |
|---|---|
| robots.txt | Present. Allows public pages; disallows `/bidpilot/` (API), dashboard, tender pages, profile, onboarding, verify-email. Lists the sitemap. |
| Sitemap | `/sitemap.xml`: 52 URLs, every one answers 200. |
| Redirects | `www`, `http://` and `tendertez.com` (+`www`) all 301 to `https://tendertez.in/`. One canonical host. |
| Canonical tags | Present on all 52 pages and match the URL. |
| Titles | Unique; all ≤ 60 characters. |
| Meta descriptions | Present on all pages. Landing pages: 156–208 characters before today's fix; after the fix (deploy pending) 120–150. Home (193), features (183), /government-tenders (176), privacy (172) are long for search snippets (~160) but complete; they also feed `/llms.txt`. Shortening them is optional (founder's wording). |
| noindex | None on public pages. Unknown landing slugs return 404 with noindex. |
| Broken internal links (server HTML) | 0. |
| Images without alt | 0 in server HTML. |
| H1 in server HTML | Landing pages: yes (44 pages). App pages (home, pricing, features, FAQ, about, privacy, register, search): the H1 is rendered by JavaScript. Google renders it; crawlers that don't run JavaScript (some AI crawlers) see only the title, description and JSON-LD. |
| Structured data | JSON-LD on `/` (Organization, WebSite, SoftwareApplication) and `/pricing` (offers). |
| `/llms.txt` | Present; lists the public pages with their descriptions. |
| Speed | First byte 0.66–0.92 s from this session. HTML 2–11 KB. One JavaScript bundle of 430 KB (184 KB gzipped) and 68 KB CSS (22 KB gzipped) load on every page, including public ones. |
| Mobile | Earlier browser checks at 390 px: no horizontal scroll on public pages. 16 of 45 real visitors in 30 days were on phones. |
| Analytics | Cookie-free visit counter + server-side GA4; UTMs recorded as `utm_source`. |
| Search Console | Domain property verified. **Sitemap not submitted yet.** No query data connected. |

## Fixed today (in this change, needs deploy)

- Landing page descriptions now stay under about 160 characters
  (`backend/src/landingPages.js`, test in `landing-pages.test.js`).

## Recommended next (by likely business impact)

1. Submit the sitemap in Search Console (founder, 1 minute).
2. A public sample analysis page from a real public tender (see `strategy.md`):
   useful content that shows the product, linked from home and pricing.
3. Server-rendered content for the key public pages (a short heading and
   paragraph in the HTML, as the landing pages already do), so non-JavaScript
   crawlers see what the page is about.
4. Split the JavaScript bundle so public pages don't load the signed-in app
   (smaller download on phones).
5. A few sourced explainer articles for learning-intent questions
   (`keyword-research.md`); needs an articles section (founder approval).
6. Connect Search Console data after 4 weeks and decide from real queries.
