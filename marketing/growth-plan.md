# Growth plan: evidence-ranked changes (16 Oct 2026)

Every row below has its evidence. "Measured" numbers come from production's own
records (read-only queries, counts only) or the live site; nothing is estimated.
Effort is the build time for one person, including tests.

## What the numbers say (last 30 days; visit counting began 12 Oct)

| Step | Count | Source |
|---|---|---|
| Visitors (visitor-days) | 45 | `visits-report.mjs 30` |
| …who saw `/register` | 4 | same |
| Sign-ups | 3 | same |
| Tenders uploaded with a PDF | 6 | `tenders` by source/status |
| …analysed | 4 | same; **0 failed** |
| …uploaded but never analysed | **2** (both from the most engaged prospect, a consultancy, 15 Oct) | same |
| Tenders tracked from the feed without a PDF | 2 | same |
| Paying customers | 0 | `subscription.mjs status` |

Traffic sources: 39 direct, 5 Google, 2 Facebook, 1 X. Entry pages: 30 of 45
visitor-days started on `/`; of those, 2 reached `/register`.

The leaks, largest first for revenue: (1) people who upload don't always reach
an analysis; (2) home visitors rarely reach sign-up; (3) no one has reached the
payment step yet, so it can't be judged.

## Ranked changes

| # | Change | Kind | Evidence | How it could raise paid conversions | Effort | Risks | Measure | Class |
|---|---|---|---|---|---|---|---|---|
| 1 | **"Ready to analyse" next step at the top of the dashboard** (and an Analyze button on the "Recently uploaded" card) | Product / activation | 2 of 6 uploads with a PDF never analysed; on a 375 px phone the only Analyze button is ~2,450 px down the page (browser check) | Value is seen only after analysis; nobody pays before seeing an analysis | 2–3 h | Low. Same API call and profile gate as today; no change to AI cost (still an explicit click); server start is idempotent | Share of uploads with a PDF analysed within 24 h (production query), before/after | **A** |
| 2 | **Channel → sign-up → activation report** in `visits-report.mjs` | Measurement | Today the report counts traffic and sign-ups separately; nothing says which source or landing page produces sign-ups | Lets us keep channels that bring sign-ups and drop ones that bring only visits | 1–2 h | Low. Read-only SQL on data already collected; no new data, no privacy change. Limit: visitor ids reset daily, so only same-day journeys link | It is the measurement | **A** |
| 3 | **Personal follow-up to the consultancy with 2 unanalysed tenders** (Gmail draft; founder sends) | Sales / activation | As row 1; the same account analysed 1 tender and completed its profile | Warmest lead; a guided first analysis is the shortest path to a paid plan | 15 min | Must not feel like surveillance: say only what helps (two tenders are waiting for one click) | Reply; both tenders analysed; plan discussion | **A** |
| 4 | Submit the sitemap in Search Console | Technical SEO (founder action) | Property verified, sitemap not submitted; 52 URLs | Faster discovery of 46 landing pages that answer "<state> government tenders" searches | 1 min | None | GSC: discovered/indexed URLs; Google visitors per landing page (report from row 2) | **A** |
| 5 | Public sample analysis of one real public tender (CPPP PDF), linked from home and pricing | Content / CRO | 30 visitor-days entered on `/`, 2 reached sign-up; the only preview is an illustrative "Example" card | Shows the real output before asking for an account | 4–6 h | One AI run (small API cost; **needs approval**); must use a public tender and its real output, unedited | Home → `/register` rate; sample-page visitors who sign up (row 2) | **A, needs approval** |
| 6 | Easier payment (online checkout, or a UPI/bank page) | CRO / revenue | Pricing "Subscribe" is a mailto; payment is by hand | Removes friction at the moment of purchase | 1–2 days (checkout) | Payment provider fees and KYC (**founder decision**), privacy policy update | Paid conversions; time from request to activation | **B** (no one has reached this step yet) |
| 7 | Server-rendered heading and summary for the 8 main public pages (as landing pages already do) | Technical SEO / GEO | Live audit: 8 public pages have no H1 or body text in server HTML (2.4 KB home HTML) | Readable by crawlers that don't run JavaScript (some AI assistants); Google already renders JS | 2–3 h | Brief unstyled text before the app loads; content must match the pages exactly | AI-assistant answers that cite TenderTez; Google impressions (GSC) | **B** |
| 8 | Help for feed-tracked tenders without a PDF (clear "download from the portal, then attach" steps) | Product / activation | 2 feed-tracked tenders, no PDF attached | Converts feed interest into analyses | 2 h | CPPP/GeM document links can't be deep-linked (CLAUDE.md); instructions only | Feed-tracked tenders that get a PDF | **B** |
| 9 | Sourced explainer articles (EMD exemption, turnover clauses) | Content SEO | Learning-intent questions answered mostly by PDFs in search results (`research/keyword-research.md`) | Qualified readers who bid; slow | 1 day each incl. sources; needs an articles section | Thin or wrong content hurts trust; legal facts must be sourced | Organic visitors to each article; sign-ups from them (row 2) | **B** (2–3 articles, not bulk) |
| 10 | Split the JavaScript bundle for public pages | Technical / speed | 430 KB JS (184 KB gzip) loads on every page; 16 of 45 visitors on phones | Faster first view on phones | 4–6 h | Route-loading regressions | Load time on a throttled phone profile | **C** |
| 11 | FAQ structured data | Technical SEO | — | Google shows FAQ rich results for few sites now | 1 h | Little | — | **C** |
| 12 | Paid X API posting | External promotion | X API charges per post (≈$0.20 with a link) | Unproven channel | — | Cost | — | **D** |
| 13 | Bulk AI articles or automated cold outreach | — | — | Low trust, spam risk, account bans | — | High | — | **D** |

External promotion (LinkedIn posts, personal email outreach, associations) is
in `strategy.md` and the content queue; its results show up in row 2's report
under the `utm_source` values.

## Order

Build 1 and 2, draft 3 (this change). The founder does 4 and decides on 5 and 6.
Then 7–9 by measured need.
