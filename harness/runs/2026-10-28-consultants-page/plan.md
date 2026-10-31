# A page for tender consultants, and structured data (28 Oct 2026)

Founder approved items 1 and 2 of the 27 Oct SEO re-audit
(`marketing/seo/technical-audit.md`).

## Steps

| # | Step | Files | Output | Check (written before the work) |
|---|---|---|---|---|
| 1 | `/tender-consultants` page from draft P3, each claim re-checked against today's code: client workspaces, per-client eligibility (meets / doesn't appear to meet / can't tell), checklist with Excel download, corrigendum check, annexure drafts (no price bids or BOQs), bid tracker with guarantees expiring in 30 days, one shared plan. Updated: the profile is optional for the first **3** tenders (was 2 in the draft). | `frontend/src/pages/TenderConsultants.tsx`, `routes.tsx`, `prerender.tsx` | page | Server HTML has one H1 and 150+ words (`check-prerender`); no claim the code doesn't back; no bid/no-bid verdict promised. |
| 2 | Register the page: title, description, sitemap, visit counting, markdown version, llms.txt. | `backend/src/seo.js`, `bidpilot/visits.js`, `md/registry.js` | page is public | `seo.test`, `md.test` (every route rendered or skipped), `visits.test`; `/tender-consultants.md` renders. |
| 3 | Links in: the "Client workspaces" card on the home page and the clients section of /features point to the page; the footer lists it. | `pages/Home.tsx`, `pages/Features.tsx`, `components/PublicLayout.tsx` | links | Browser: each link opens the page. |
| 4 | Structured data: FAQPage on `/faq` and `/tender-consultants`, built from the questions and answers in the page's own server HTML (so it can't differ from the page); Organization on `/about` (same facts as the home page's); WebPage + BreadcrumbList on `/tender-consultants`; BreadcrumbList on every tender list (Home > Find government tenders > the list). | `backend/src/seo.js`, `backend/src/landingPages.js` | JSON-LD | Tests: FAQPage questions equal the page's `<summary>` texts and answers its text; Organization on /about; BreadcrumbList on a landing page; JSON-LD parses; live check after deploy. |
| 5 | Verify and document. | `BIDPILOT_ARCHITECTURE.md`, `progress.md` | docs | `verify.sh --checks` all pass; browser check at 390 and 1366 px. |

Commit, push and deploy only after the founder says so.
