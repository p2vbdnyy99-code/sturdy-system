# VentureScout — Opportunity Scan #1 (2026-10-21)

**Verdict: none of the 10 candidates is ready to build.** The best lead is a *lane*, not yet a product:
**paid Jira Cloud report and dashboard-gadget apps on the Atlassian Marketplace, launched behind a free
"wedge" app.** It scores 69/100. Decision: **gather more evidence** (a keyword-level niche scan plus a
partner-eligibility check) before writing any product code.

The biggest finding is structural. AI-assisted building has flooded the software marketplaces.
**41% of all Jira/Confluence Cloud apps (2,736 of 6,632) were first released in the last 18 months.
The median new app has 2 installs, and only 93 (3.4%) have reached 100.** An idea that is "easy to build"
now gets dozens of competitors within months. Distribution evidence has to come from *new entrants*,
not from incumbents.

---

## 0. Capabilities actually used in this session

| Capability | Status |
|---|---|
| Web search and page fetch | Worked |
| Atlassian Marketplace public REST API (`marketplace.atlassian.com/rest/2`) | Worked: full Cloud catalogue, pricing, reviews and version history pulled |
| Apify Store public API (`api.apify.com/v2/store`) | Worked: top 3,972 actors by popularity |
| Google Workspace Marketplace search page | Worked via fetch: install counts are visible |
| Chrome Web Store, Etsy, Shopify App Store bulk data | Not pulled: no public bulk API was used; evidence is from listing pages and secondary sources |
| Persistent or scheduled execution | **Not configured.** The scanners run only when a cloud session runs them |

Raw data from this run is in `venturescout/data/2026-10-21/` and the scripts are in `venturescout/scanners/`.

---

## 1. Hard evidence from the scans

### Atlassian Marketplace (primary data, pulled 2026-10-21)

- **Flood:** 2,736 of 6,632 Cloud apps were first released on or after 2025-04-21.
  New-app installs: median **2**, 90th percentile **24**, and **93** apps at ≥100 installs.
- **Mermaid diagrams for Confluence Cloud:** 62 apps mention Mermaid and **45 have fewer than 100 installs**.
  42 launched since 2025; only 7 reached ≥100 installs, and most of those came from established vendors.
- **Markdown/Git docs for Confluence:** 36 launched since 2025 and 3 reached ≥100 installs.
  Seven Git/Markdown sync apps launched in 2026, each with 0–4 installs.
- **Win rate by category** (new apps since 2025-04-21 reaching ≥100 installs). This covers only the
  454 new apps that carry categories; the 2,282 uncategorised new apps win at 2.6%:
  Macros 19% (6/31) · Tasks 14% (3/21) · Reports 14% (11/79) · Documentation 14% (8/59) ·
  Time tracking 14% (5/37) · Dashboard gadgets 13% (3/24) … Integrations 2% (3/144) ·
  Security 2% (1/52) · Custom fields 0% (0/88). Small samples, so treat these as directional.
- **A genuine newcomer who won:** *Agile Pulse* first listed in Feb 2025 with a **free** "Planning Poker Agility"
  app (3,285 installs). It then launched **paid** apps: SprintPoker (676 installs, launched 2026-02),
  SprintRetro Pro (593, 2026-04), Laya WorkflowOS (561, 2026-06) and Laya Export Studio (530, 2026-06),
  each priced at $210/yr for 25 users and $840/yr for 100 users.
  *Installs are not paying customers. The paid share is not public.*
- **A misleading "newcomer":** *Broken Build* launched 5 paid agile-chart apps between 2025-10 and 2026-03,
  each with about 830–875 installs, at $137.50/yr for 25 users and $550/yr for 100 users. But its first app dates
  from 2014, so these launches ride an existing brand.
- **Unexplained:** Korvex Systems has four connector apps launched within one week in April 2026, each with
  about 440–450 installs and 0 reviews. Not used as evidence either way.
- **Revenue share (verified, primary):** Forge apps pay **0% on the first $1M of lifetime Forge revenue**
  from 1 Jan 2026. Above that, the standard Forge rate rises to 16% and then 17%. Connect apps pay 20% and then 25%.
  ([Atlassian, May 2025](https://www.atlassian.com/blog/developer/updates-to-marketplace-revenue-share-2026);
  dates were later extended, see [timeline update](https://www.atlassian.com/blog/development/extended-timelines-for-marketplace-revenue-share-changes))
- **Data Center end of life (verified, primary):** no new Data Center customers after 2026-03-30; no
  expansions after 2028-03-30; end of life on **2029-03-28**
  ([Atlassian](https://www.atlassian.com/licensing/data-center-end-of-life)). I checked 649 DC apps that have no
  Cloud listing under the same key. The high-install ones are mostly Atlassian-owned, admin/SSO tools, or
  already have Cloud substitutes. **No big unfilled migration gap was found.**

### Apify Store (primary data)

- Top 3,972 actors by popularity: the **top 10 hold 35%** and the **top 100 hold 78%** of 30-day users.
  The #100 actor has 1,120 monthly users, #500 has **112**, and #1,000 has **32**.
- 977 of the top 1,000 actors use pay-per-event pricing. The developer receives 80% minus platform costs
  ([Apify docs](https://docs.apify.com/actors/publishing/monetize/pay-per-event.md)).

### Other channels (secondary evidence)

- **Search/SEO:** organic CTR on informational queries that show AI Overviews fell 61% from mid-2024 to Sept 2025
  ([Seer Interactive](https://www.seerinteractive.com/blog/aio-impact-on-google-ctr-september-2025-update)).
  Ahrefs estimates a 58% drop in CTR for top-ranking pages
  ([PPC Land](https://ppc.land/googles-ai-summaries-now-swallow-58-of-clicks-that-once-went-to-websites/)).
- **Shopify:** 0% revenue share on the first $1M lifetime, then 15%, plus a $19 one-time registration fee
  ([shopify.dev](https://shopify.dev/docs/apps/launch/distribution/revenue-share)).
  At least 8 EU GPSR compliance apps are listed, most with **zero reviews**
  ([example](https://apps.shopify.com/gpsrready), [roundup](https://meetanshi.com/blog/eu-gpsr-apps-shopify/)).
  A 2021 model estimate put 54.5% of Shopify developers under $1k/month
  ([Spur-IT](https://spur-i-t.com/blog/shopify-app-store-analysis-2021/)). That figure is old and modelled.
- **Google Workspace Marketplace:** install counts are public. In the Notion↔Sheets niche, Sync2Sheets shows
  193K+ installs ([search page](https://workspace.google.com/marketplace/search/notion%20sync)). Its founder
  reports about $9K MRR from 400+ paying customers
  ([Starter Story](https://www.starterstory.com/stories/sync2sheets-give-notion-the-superpowers-of-google-sheets);
  self-reported, date unclear). *Inference:* ≈0.2% of installs pay. The two figures may come from different dates.
- **WordPress freemium:** typical free-to-paid conversion is 1–2% (vendor-sourced
  [Freemius](https://freemius.com/blog/freemium-business-model-wordpress/)).
- **Chrome extensions:** ExtensionPay reports more than $500k paid out in total across all its extensions
  ([GitHub](https://github.com/Glench/ExtPay/)). No audited per-extension data was found.
- **Etsy spreadsheets:** only anecdotal seller income
  ([Side Hustle Nation](https://www.sidehustlenation.com/selling-spreadsheets-on-etsy/)); the niche is called saturated.

---

## 2. Economics frame (applies to every candidate)

```
target take-home T = $9,000/mo (midpoint of $8–10k)
tax rate t        = UNKNOWN. 25% and 35% below are placeholders, not your rate
pre-tax profit    = T / (1 − t)                  → $12,000 (t=25%) … $13,846 (t=35%)
gross needed      ≈ pre-tax profit + fixed costs → assume ~$50/mo fixed → $12,050 … $13,896 /mo
                                                 → $144,600 … $166,752 /yr
```

Required customers for that gross. Prices are hypotheses; fees marked † are from memory and must be verified.

| Model | Price hypothesis | Net per unit after fees | Customers needed |
|---|---|---|---|
| Atlassian app, conservative | $150/yr per paying site (≈25 users) | 0% fee (Forge, first $1M) | **964–1,112 sites** |
| Atlassian app, base | $550/yr per site (≈100 users; Broken Build price point) | 0% | **263–303 sites** |
| Atlassian app, optimistic | $1,000/yr per site | 0% | **145–167 sites** |
| Shopify app | $10/mo | 0% (first $1M) | 1,205–1,390 merchants |
| Sheets add-on | $22.5/mo (Sync2Sheets implied) | ~5%† → $21.4 | 563–649 payers ≈ **268k–309k installs** at 0.21% (inference) |
| Chrome extension | $5/mo | ~10%† → $4.50 | 2,678–3,088 subscribers |
| Etsy template | $15 | ~11%† → ~$13.3 | 906–1,045 sales **every month** |
| WordPress plugin | $79/yr | ~10%† → ~$71 | 2,037–2,349 active licences ≈ 102k–235k active installs at 1–2% |
| Apify actor | per-event | 80% minus platform | at the #500 actor's 112 users: **$134–155 per user per month**, implausible (inference) |

Every row also needs **support time, refunds, and the tax and legal setup for your country**, none of
which are known yet. Confirm tax treatment with a qualified professional before relying on these numbers.

---

## 3. The 10 candidates

Scores are my judgement applied to the evidence above (weights in `venturescout/README.md`).
D = demand/20, Di = distribution/20, Df = differentiation/10, E = economics/15, C = competition/10,
F = feasibility/10, $ = cost/5, A = automation/5, R = recurring/5.

| # | Opportunity | D | Di | Df | E | C | F | $ | A | R | **Total** | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Jira Cloud reports/gadgets lane with a free wedge app | 15 | 13 | 4 | 10 | 4 | 8 | 5 | 5 | 5 | **69** | Low–moderate |
| 2 | Google Sheets add-on (SaaS→Sheets data connector) | 11 | 10 | 5 | 9 | 5 | 7 | 4 | 4 | 5 | **60** | Low |
| 3 | Confluence Cloud Mermaid/diagram app | 15 | 4 | 3 | 9 | 1 | 9 | 5 | 5 | 5 | **56** | Moderate (it's a no) |
| 4 | Shopify EU GPSR compliance app | 7 | 10 | 3 | 8 | 3 | 8 | 5 | 5 | 4 | **53** | Low |
| 5 | Etsy/Gumroad niche business spreadsheets | 12 | 10 | 3 | 5 | 2 | 9 | 5 | 5 | 1 | **52** | Low |
| 6 | WordPress.org freemium plugin | 11 | 10 | 4 | 6 | 3 | 6 | 4 | 3 | 5 | **52** | Low |
| 7 | Apify Store actor (pay-per-event) | 12 | 8 | 4 | 4 | 3 | 8 | 4 | 4 | 4 | **51** | Moderate (it's a no) |
| 8 | Confluence Git→Markdown docs sync | 11 | 4 | 4 | 10 | 2 | 6 | 4 | 4 | 5 | **50** | Moderate (it's a no) |
| 9 | Chrome AI-copilot extension (the existing prototype in this repo) | 8 | 6 | 2 | 6 | 2 | 8 | 3 | 4 | 4 | **43** | Moderate |
| 10 | Programmatic-SEO calculator site with affiliate links | 9 | 5 | 3 | 4 | 3 | 8 | 5 | 5 | 1 | **43** | Moderate |

### Per-opportunity detail

**1. Jira Cloud reports/dashboard-gadget lane with a free wedge** (69)
- *Customer:* Jira admins and team leads at companies on Jira Cloud. *Problem:* built-in reporting misses specific agile, flow or time metrics.
- *Solution:* one free app that targets a high-volume marketplace search term, plus 2–3 narrowly named paid siblings, each matching a specific search term. This copies Agile Pulse's sequence.
- *Alternatives:* Broken Build, eazyBI, Custom Charts, Rich Filters, Time in Status (5,202 DC installs for SaaSJet's), plus Jira's native reports.
- *Demand evidence:* Reports is 734 Cloud apps with 424,926 total installs; Dashboard gadgets is 265 apps with 295,426 installs; paid apps price at $137–$350/yr for 25 users.
- *Pays for similar:* yes. Public per-user pricing exists (e.g. Broken Build's $550/yr for 100 users), but **the number of paying sites is not public**.
- *Differentiation:* **not yet identified.** This is the open question for the next scan.
- *Discovery channel:* Atlassian Marketplace in-product search ("Find new apps" inside Jira) and marketplace.atlassian.com search for terms such as "cycle time", "aging", "burnup".
- *Why a new entrant can be found:* new apps in Reports win at about 14% vs 3.4% overall, and Agile Pulse shows the wedge-then-paid sequence working from zero within about 20 months.
- *Pricing hypothesis:* $5.50/user/yr at 100 users (matches the market). *Customers needed:* 263–303 paying sites (base).
- *Costs:* Forge hosting (**pricing not yet verified**), a domain, a support desk, a privacy policy and EULA. *Ops complexity:* low–medium. *Maintenance:* Jira API and Forge platform changes.
- *Risks:* (a) **partner eligibility**: Atlassian's due-diligence form asks for a registration or tax ID, and individual eligibility is unconfirmed ([thread](https://community.developer.atlassian.com/t/can-an-individual-sole-proprietor-based-in-turkey-publish-and-sell-paid-marketplace-apps/102081)); (b) the install-to-paid ratio is unknown; (c) Atlassian could add the feature natively; (d) the flood reaches this category too.
- *Strongest argument against:* no one outside a vendor knows how many of those 500–900 installs pay, so the economics could be off by 5×.
- *Cheapest disproof:* the keyword-level scan (Next Actions #1). If no report niche has weak incumbents *and* recent entrants winning, the lane is dead. Cost: about one cloud session.
- *Sources:* Atlassian Marketplace API data in `data/2026-10-21/`; revenue-share and Data Center end-of-life links above.

**2. Google Sheets add-on: data connector from a SaaS into Sheets** (60)
- *Customer:* ops and finance staff who live in Sheets. *Problem:* manual CSV exports from a SaaS tool. *Alternatives:* Coefficient (659K+ installs), Sheetgo (6M+), Unito, Zapier.
- *Evidence:* Sync2Sheets reports $9K MRR and 400+ payers (self-reported). In the same search, 6+ Notion-sync competitors appear.
- *Channel:* Workspace Marketplace search and the "Extensions → Add-ons → Get add-ons" menu inside Sheets.
- *Price:* about $20/mo. *Needed:* 563–649 payers, roughly 270k–310k installs at the implied 0.2% ratio (inference).
- *Against:* the install volume needed is close to the category leader's. The new-entrant gate is **untested here**.
- *Cheapest disproof:* fetch Workspace Marketplace pages for 20 connector niches and check whether apps listed in the last 12 months reach 1K+ installs.
- *Note:* Google requires an OAuth security review for restricted scopes, which can cost money. Not yet verified.

**3. Confluence Cloud Mermaid/diagram-as-code app** (56; reject)
- *Demand is real:* the Atlassian Labs viewer has 7,658 installs, Stratus 6,228 (paid, $400/yr for 100 users), and Mermaid Chart 4,091.
- *Specific complaints from 2026 reviews:* tiny or blurry PNG output, no zoom or full-screen view, an external account required, Mermaid 10.x instead of 11.x, dark mode broken, PDF export shows raw code, content not indexed by search.
- *Why reject:* 28 Mermaid-related apps launched in 2026 alone, several aimed at exactly these complaints ("Mermaid SVG Diagrams", "Mermaid Live Preview", "Crisp Mermaid"). 21 of the 28 have 6 installs or fewer, and only 3 exceed 100 (Narva, an established vendor, 702; RVS Softek 201; 9ByNight 120). The gap is visible to everyone, and the marketplace does not surface newcomers here.
- *Also:* draw.io (60,753 installs) supports Mermaid input.

**4. Shopify EU GPSR compliance app** (53)
- A real regulatory need (the EU General Product Safety Regulation) with 8+ apps at $0–$29/mo, mostly with **zero reviews**.
  That is "no evidence of demand", not "evidence of no demand". It may mean merchants handle GPSR with theme fields or ignore it.
- *Cheapest disproof:* check review velocity and "installs"/"popular" badges on the top 3 GPSR apps a month apart. If none is gaining reviews, demand is weak.

**5. Etsy/Gumroad niche business spreadsheets** (52)
- Proven buyers, but you need about 1,000 sales a month at $15, with no recurring revenue and heavy competition from Etsy ads.
  Viable as a side income, not as the $9K engine.

**6. WordPress.org freemium plugin** (52)
- The WordPress.org directory is a real discovery channel, but at 1–2% conversion you need 100k–235k active installs. The support load is high.

**7. Apify Store actor** (51; reject)
- Usage is very concentrated. A newcomer would land around rank 500+ (about 112 users a month) and would need about $134–155 per user per month.
  The top categories (social-media scraping) also carry platform terms-of-service and legal risk.

**8. Confluence Git→Markdown docs sync** (50; reject for now)
- Real needs appear in reviews (subfolders, linked READMEs, images, private Bitbucket auth), but 7 near-identical apps launched in 2026 with 0–4 installs each.

**9. Chrome AI-copilot extension (`ai-copilot-prototype/`)** (43)
- It's already built, but generic AI page assistants compete with free built-in browser and OS assistants and with hundreds of extensions.
  It also carries per-user LLM API costs. **Do not invest further** unless a specific niche workflow appears.

**10. Programmatic-SEO calculators with affiliate links** (43; reject)
- AI Overviews have cut informational CTR by about 58–61% in the studies above. Calculator queries are exactly the kind Google answers inline.

---

## 4. Execution report

**A. What we learned**
1. Building is no longer the constraint. Atlassian's own data shows 2,736 new Cloud apps in 18 months, with a median of 2 installs.
2. Incumbent install counts prove demand, not reachability. The gate that matters is whether new entrants are winning.
3. New entrants still win in a few places: Atlassian Reports, Tasks, Time tracking and Macros (13–19% of categorised new apps
   reach 100 installs), and the clearest case starts with a free wedge app.
4. Search-led content businesses face a 58–61% CTR headwind from AI Overviews.

**B. Best current opportunity:** #1, the Jira Cloud reports lane with a free wedge. Confidence is low–moderate: the channel evidence is strong, the revenue evidence is weak.

**C. Evidence vs assumptions**
- *Evidence:* install counts, release dates, pricing and reviews (Atlassian API); revenue-share terms; Data Center end-of-life dates.
- *Assumptions:* the install→paid ratio; your tax rate; Forge hosting cost; whether you are eligible as a paid-app partner; that Agile Pulse's pattern repeats.

**D. Economics:** 263–303 paying sites at $550/yr (base), and up to 964–1,112 at $150/yr (conservative), to net $9K/mo at 25–35% tax.
At the 0% Forge rate, that gross stays under the $1M lifetime cap for about 6–7 years.

**E. Distribution:** a Jira admin opens "Apps → Explore more apps" inside Jira or searches marketplace.atlassian.com
for a specific report ("cycle time report"), installs a free trial (Atlassian trials are self-service), and the
subscription bills through Atlassian. No outreach is needed. **Unverified:** how listings rank for a brand-new vendor.

**F. Next three actions**
1. **Keyword-level niche scan** (me, in a cloud session; about one session). For about 40 specific report or gadget search terms,
   pull the top results, the leader's installs and rating, recent 1–3★ review text, and recent-entrant wins.
   Output: the 3 most open niches, or a decision to kill the lane.
2. **Eligibility and cost check:** Atlassian partner requirements for an individual in your country (tax ID, payouts),
   Forge platform pricing, and Atlassian's free-tier rules for apps.
3. **Run the new-entrant gate on the Google Workspace Marketplace** for candidate #2, as the backup lane.

**G. Your immediate action (iPhone/iPad, about 5 minutes):** reply with (1) your country of tax residency and
(2) whether you have, or can get, a business registration or tax ID (in India, for example: PAN, GST, Udyam).
Atlassian, Shopify and Google all gate paid listings and payouts on this, and it decides which lanes are open to you.

**H. What to avoid**
- Building any Mermaid, Markdown, Git-sync or "AI copilot" app. The 2026 flood data rules these out.
- Further work on `ai-copilot-prototype/` or the trading agent (`self-learning-agent/`), which is off-mission.
- Buying domains, Shopify Partner registration, Google OAuth verification or any paid tool before #1 passes the niche scan.
- Treating installs, waitlists or stars as revenue.

**I. Decision:** **Gather more evidence.** Do not build yet.
