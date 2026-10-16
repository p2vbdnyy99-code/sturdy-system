# Connector matrix (checked 16 Oct 2026)

"Tested" means used from this repository or this Claude Code session today.
Prices come from the sources linked; several are third-party summaries, so
check the vendor's own page before relying on them. Nothing here is set up to
spend money.

| Service | Official API | MCP / connector | Auth | Cost | Read | Write | Status |
|---|---|---|---|---|---|---|---|
| **X** | Yes (X API v2) | none connected | OAuth 2.0, developer account | No free tier for new developers since 6 Feb 2026; pay per use. Third-party sources give about $0.01–0.015 per post and **$0.20 per post with a link**; reads about $0.005 per post ([postproxy](https://www.postproxy.dev/blog/x-api-pricing-2026/), [opentweet](https://opentweet.io/x-api-pricing)) | posts, users (paid) | posts (paid) | **Not used.** Every post we write carries a link, so API posting costs money. Manual posting from the approval queue. |
| **LinkedIn (personal profile)** | Yes: "Share on LinkedIn" product, scope `w_member_social`, self-serve | none | OAuth 2.0 (3-legged) via a LinkedIn developer app the founder creates | Free | own profile basics | posts as the member | **Not built.** Possible at no cost; needs the founder to create a developer app and sign in. Worth it only once manual posting proves the channel. |
| **LinkedIn (company page)** | Community Management API, scope `w_organization_social` | none | OAuth + LinkedIn review; company page verification is a prerequisite ([Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide)) | Free, but vetted | page posts, stats | page posts | **Not available** until LinkedIn approves an application. Manual posting. |
| **Google Search Console** | Yes (Search Analytics, URL Inspection, Sitemaps) | none | OAuth or service account added as a user on the property | Free, with quotas (URL inspection 2,000/day per site) ([limits](https://developers.google.com/webmaster-tools/limits)) | queries, pages, index status | submit sitemaps | **Property verified** (DNS TXT, earlier this month). Sitemap submission is a 1-minute manual step for the founder. API not connected: needs a Google Cloud OAuth client. |
| **Google Analytics 4** | Measurement Protocol (write), Data API (read) | none | API secret (write, set as Fly secret); OAuth/service account (read) | Free (quotas) | reports (Data API) | events | **Write tested and live:** the server sends page views of public pages (`bidpilot/ga4.js`). Read API not connected. Our own `visits-report.mjs` reads the same visits from Postgres for free. |
| **Google Business Profile** | Business Profile APIs | none | OAuth, approved project | Free | — | — | **Not eligible.** Google excludes online-only businesses with no place customers visit and no in-person service ([Google](https://support.google.com/business/answer/13763036)). Don't create one. |
| **Gmail** | Gmail API | **Gmail connector (claude.ai), connected** as advayaicopilot@gmail.com | OAuth (done by the founder) | Free | search, read threads | drafts, send, labels | **Tested today:** read the sent folder (recorded 19 earlier contacts) and created 2 outreach **drafts**. Sending stays manual (approval rule). |
| **Google Drive** | Drive API | **Drive connector, connected** (the account named in CLAUDE.md lesson 12) | OAuth | Free | files | create, share | Available for CRM backups (`ttm export`). Share files with advayaicopilot@gmail.com. |
| **GitHub** | REST/GraphQL | GitHub MCP in this session (this repository only) | GitHub App | Free | code, PRs | commits via git | Working (this workspace). Not a marketing channel. |
| **Website (tendertez.in)** | Our own code | — | — | Fly.io app already paid for | `visits-report.mjs`, landing pages, `/llms.txt`, sitemap | deploys need approval | Working. SEO audit reads it live (`ttm seo-audit`). |
| **Hostinger (DNS, domains)** | Hostinger API | **Hostinger connector, connected** | OAuth | — | DNS, domains | DNS changes | Read only for marketing. **No DNS changes without the founder's permission.** |
| **CPPP public tender lists** | No API; public HTML | our own collector | none | Free | latest active tenders, results of tenders | — | Live (`BIDPILOT_DISCOVERY_CPPP=on`); polite, 2 s pause, identifies itself. Results-of-tenders pages (`/cppp/resultoftendersnew/cpppdata`) are a public source of award evidence for prospects. |
| **GeM** | No public API for sellers/buyers | — | — | — | public bid list (not reachable from outside India) | — | Manual only. Not scraped. |
| **Typefully** (X + LinkedIn scheduling) | Yes | claude.ai connector **available, not connected** | OAuth (founder) | Free plan reportedly 1 social set, ~15 posts/month; paid from about $10/month (third-party: [toolradar](https://toolradar.com/tools/typefully/pricing)) | drafts | drafts, schedule | Best free route to schedule approved posts if its free plan still covers LinkedIn and X. Founder connects it in claude.ai → Settings → Connectors; test before relying on it. |
| **Taplio / Metricool** | Yes | claude.ai connectors available, not connected | OAuth | Paid plans; free tiers limited | — | — | Not recommended until a channel proves itself. |
| **Brevo** (email) | Yes | none | API key | Free: 300 emails/day, "Sent by Brevo" footer ([emailtooltester](https://www.emailtooltester.com/en/?p=3010)) | — | sends | Not needed: Gmail handles low-volume, personalised outreach. Consider for a newsletter to opted-in users only. |
| **Explee** (founder's AI outreach tool) | — | — | founder's account | founder's plan | — | sends | **Unknown content.** It has been emailing a large list since 14 Oct; its messages aren't visible from here. The founder should check what it says matches the claim rules in `brand-guide.md`. |
| **Apify** | Yes | Apify connector available in this session | Apify account | Paid credits after a free monthly allowance | — | — | **Not used.** Scraping actors for LinkedIn/Facebook would break those platforms' terms; we don't use them. |

## What a publishing integration would take (when the founder wants it)

1. **LinkedIn personal posts (free):** founder creates an app at
   https://www.linkedin.com/developers/apps, adds the "Share on LinkedIn" and
   "Sign In with LinkedIn using OpenID Connect" products, sets a redirect URL,
   and signs in once. The token goes in an environment variable on the
   founder's machine (`TTM_LINKEDIN_TOKEN`), never in chat or Git. Then a
   `publish_linkedin_post` tool can post **approved** queue items only.
2. **X:** not worth paying per post until LinkedIn and email show what converts.
   If wanted later: developer account, pay-per-use credits, a spend cap set in
   the X console, and a `publish_x_post` tool limited to approved items.
3. **Search Console read access (free):** Google Cloud project → enable the
   Search Console API → OAuth client (desktop) → the founder signs in once →
   refresh token stored as an environment variable. Then
   `retrieve_authorised_analytics` can report clicks and queries per page.

Until then the approval queue is the publishing workflow: approve → post by
hand → `ttm published <id> <url>` → `ttm metrics <id> …`.
