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


## Re-audit, 27 Oct 2026

Measured with `python3 -m ttm seo-audit` and a page-by-page read of every
sitemap URL's server HTML (title, description, H1, words, JSON-LD, time),
from this cloud session (not from India; timings indicative).

| Check | 16 Oct | 27 Oct |
|---|---|---|
| Sitemap URLs | 52 | 58 (3 guides, `/guides`, Kerala merged), with `<lastmod>` |
| Issues found by `seo-audit` | landing descriptions long | none |
| Broken internal links | 0 | 0 |
| H1 in server HTML | landing pages only | 57 of 58 (all but `/register`, a form) |
| Titles | unique, ≤60 | unique, 26–60 (`/privacy-policy` is the short one) |
| Descriptions | some >160 | all 70–160, all unique |
| Pages under 250 words of server text | most app pages | `/government-tenders` (212), `/guides` (238), `/register` (6) |
| Structured data | `/`, `/pricing` | `/`, `/pricing`, the 3 guides (Article, BreadcrumbList) |
| Server response | 0.66–0.92 s | median 476 ms, slowest 895 ms; HTML at most 22 KB |
| Images without alt | 0 | 0 |
| Search Console / Bing | verified, sitemap not submitted | sitemap submitted by the founder (27 Oct); no query data connected here |
| Markdown versions, llms.txt, ai.txt | llms.txt only | every public page has a `.md` version; llms-full.txt and ai.txt live |

### Still open (proposals for the founder)

1. `/tender-consultants` page (draft P3 in `pages/`): the use-case page for
   the segment all current outreach targets.
2. Small structured-data additions: FAQPage on `/faq` (from the rendered
   answers), Organization on `/about`, BreadcrumbList on the tender lists.
3. A short server-rendered explainer on `/government-tenders` (how the lists
   work, CPPP credit, not every tender) to lift it above 250 words.
4. Comparison pages P1 (`/ai-tender-analysis-tools`) and P2
   (`/chatgpt-vs-tendertez`): every claim about another product must be
   checked on its own public page first.
5. Leave `/register` out of the sitemap (a form with no content to rank).
