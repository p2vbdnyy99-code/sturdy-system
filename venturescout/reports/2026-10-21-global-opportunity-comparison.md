# VentureScout: Global Opportunity Comparison (v2 method, 2026-10-21)

## Answer first

**Strongest global opportunity on current evidence: a small portfolio of *lawful* pay-per-event tools on the
Apify Store.** These are utilities and official/open-data wrappers that AI agents and developers call. It scores
**68/100**, narrowly ahead of Jira Cloud reporting apps (**66**) and well ahead of WordPress freemium plugins (**56**).
The two-point gap is within scoring error. What separates them is that Apify has *measured* newcomer traction and Jira does not.

**Decision: GATHER MORE EVIDENCE (one cheap, decisive test). Do not build a product yet.**

Why Apify ranks first:
- It is the **only channel where newcomer traction is measured, large and recent.**
  - 310 actors created since 2025-04-21 have ≥100 users a month; 223 of them come from developers who are new to the top listings.
  - Of 13,084 actors created in the last 17 days, **82 (0.6%) already exceed 100 users a month.**
- Apify bills the customer, takes 20% plus platform usage costs, and pays individuals or companies monthly after identity checks.

Why confidence is only low–moderate:
1. **Revenue per user is not public.** Users are not revenue.
2. **About 770 new actors a day** compete for attention.
3. **Most of the traction is in scraping third-party platforms** (LinkedIn, Google, social networks). VentureScout's
   lawful-and-within-terms gate rejects that. The lawful subset (e.g. email verification, screenshots) shows traction
   but is commoditised.
4. **The target needs top-tier results.** Payouts of $10.8k–$13.4k a month are ~35–44× the *average* developer payout.
   Apify says only its "most successful independent creators" exceed $10k MRR.

Tags: **[V]** verified from a primary source or our own API pull · **[S]** secondary/community · **[H]** hypothesis · **[?]** missing.

---

## 1. What changed in the method

- **Global-first:** customer geography and seller jurisdiction are scored separately. Seller questions are risks,
  not filters (README → "Global-first principle").
- **Scoring v2:** eight dimensions.
  - Global demand 15 · Discoverability 10 · **New-entrant evidence 20** · Seller eligibility 10 · Payment infrastructure 10 · Structure/tax 5 · Unit economics 20 · Operating burden 10.
  - Missing evidence scores at most half of a dimension's weight.
- **Hard gates:** constraint-compliant acquisition; lawful and within platform terms; paid demand.

---

## 2. Newcomer distribution, measured across channels

| Channel | What we measured (date 2026-10-21) | Newcomer result | Billing / payouts |
|---|---|---|---|
| **Apify Store** | Top 3,972 actors by popularity, with creation dates; the newest 13,084 actors (API caps offset at ~15k) | **310** actors created since 2025-04-21 at ≥100 users/30 days (**223** from new developers; 38 at ≥1,000). Of actors created 2026-10-04 → 10-21, 0.6% are already >100 users/30d | Apify bills users. Developer gets 80% minus platform cost ([docs](https://docs.apify.com/platform/actors/publishing/monetize)) [V]. KYC for "individual or company"; PayPal (min $20) or wire (min $100) [S] ([help](https://help.apify.com/en/articles/10057167-questions-regarding-payouts)) |
| **Atlassian Marketplace** | 6,632 Cloud apps with first-release dates | Independent newcomers: **37 of 1,918 (1.9%)** reach ≥100 installs in 18 months. Jira report cohort (152 apps, last 90 days): **median 1 install** | Atlassian bills customers and handles sales tax; 0% fee on the first $1M (Forge) [V]. Individual partners allowed [V]; per-country payout list not published [?] |
| **WordPress.org** | All 22,572 plugins added since 2025-04-21 | **74% have 0 active installs**; 1,075 (4.8%) ≥100; 180 (0.8%) ≥1,000. Plugins by new author accounts: 705 ≥100, 89 ≥1,000, 6 ≥10,000. Many of those "new authors" are big brands (Hostinger, eRecht24, Visa) | No marketplace billing. Use a merchant of record (MoR) such as Freemius: 4.7% + gateway, payouts to 190+ countries via PayPal/Payoneer/Wise/wire [S] ([Freemius](https://freemius.com/help/documentation/selling-with-freemius/supported-countries.md)) |
| **Shopify App Store** | Third-party tracker (data from 2026-05-25) | 7,003 new apps in 12 months; "half the store has never earned a single review" [S] ([AppJubilee](https://www.appjubilee.io/shopify-app-store-report-2026)) | Shopify bills; 0% on the first $1M, then 15%; $19 registration [V] ([shopify.dev](https://shopify.dev/docs/apps/launch/distribution/revenue-share)). Partner payout country list not found [?] |
| **Chrome Web Store** | Not measured: data source returned 403 [?] | **Unmeasured** | No store billing; needs an MoR or Stripe |
| **Google Workspace Marketplace** | Listing pages show install bands and "updated" dates only | **Unobservable** without repeated snapshots | Google billing for third-party apps not confirmed [?]; CASA security assessment for restricted scopes [S] |
| **Organic search utilities** | Secondary studies | AI Overviews cut informational CTR by ~58–61% [S] ([Seer](https://www.seerinteractive.com/blog/aio-impact-on-google-ctr-september-2025-update)) | Own checkout via MoR |

**Limitations:**
- "New developer" on Apify means the developer's first appearance in the *top* list, which overstates independence.
- Apify user counts include free-credit users.
- WordPress install counts are bucketed. Author-account age misclassifies brand-new accounts of established companies.
- None of these numbers is revenue.

---

## 3. Payment infrastructure and seller eligibility (global view)

| Option | Who can sell | Notes |
|---|---|---|
| Apify payouts | "individual or company", with KYC [S] | Country list not found [?] |
| Atlassian payouts | Individuals allowed [V] | KYC (Stripe Identity), bank account in own name, $500 minimum [V]. W-8BEN for non-US partners [S]. India-specific answers still pending (risk, not blocker) |
| Shopify Partner payouts | Partners worldwide; Hyperwallet/PayPal methods [S] ([Shopify blog](https://www.shopify.com/partners/blog/payout-methods)) | Current list not found [?] |
| Paddle (MoR) | Sellers in "over 200 countries and territories", minus sanctioned ones [V] ([Paddle](https://developer.paddle.com/partners/embed-billing/get-started/supported-sellers)) | Full list behind partner login [?] |
| Lemon Squeezy (MoR) | Bank payouts in 100+ listed countries; PayPal in 200+ [V] ([docs](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)) | Stripe-owned |
| Freemius (MoR, WordPress/SaaS) | 190+ countries [S] | 4.7% + gateway [S] |
| Stripe direct | Many countries; **India is invite-only since May 2024** [V] ([Stripe](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india)) | |
| Stripe Managed Payments (MoR) | Launched in API 2026-04-22 [V] ([changelog](https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments.md)) | Some seller countries reportedly excluded [S] |

**Conclusion:**
- Every top-3 option has a legitimate path for a non-US individual. Platform-billed channels (Apify, Atlassian, Shopify) are the simplest.
- No option requires forming a company abroad, and none is recommended.
- Exact per-country payout support remains an **open risk** to confirm with each platform before publishing.

---

## 4. Twelve opportunities, scored on v2

Scoring rule applied: where evidence is missing ([?] or only [S]) a dimension gets at most half its weight. That caps
seller eligibility at 5 unless an official source confirms it, and Jira unit economics at 10 because install-to-paid is unknown.

Columns: D = demand/15 · Di = discoverability/10 · N = newcomer evidence/20 · E = eligibility/10 · P = payments/10 · T = structure and tax/5 · U = unit economics/20 · O = operating burden/10.

| # | Opportunity | Target geography | Channel | Newcomer evidence | Pricing evidence | D | Di | N | E | P | T | U | O | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Lawful Apify PPE tools** (utilities, official/open-data wrappers, validation) | Global B2B developers and AI agents (buyer geography not published [?]) | Apify Store search, Apify MCP / agent discovery | Strong for the channel; moderate for the lawful subset (BounceVerify email verifier: launched 2026-04-23, **1,705** users/30d [V]) | PPE: email verification ~$0.85–$1 per 1k (listing titles) [V]; platform payouts $1.7M/month [V] | 13 | 8 | 15 | 5 | 9 | 4 | 8 | 6 | **68** |
| 2 | **Jira Cloud time-in-status / flow reporting** | Global Atlassian customers | Marketplace search, in-product "Explore apps" | Weak: independents 1.9%; report cohort median 1 [V] | 100-user tier $500–$2,260/yr [V] | 14 | 8 | 6 | 6 | 10 | 4 | 10 | 8 | **66** |
| 3 | **WordPress MCP/AI-connector plugin (freemium)** | Global site owners | WordPress.org search | Moderate: 229 new, 29 ≥100, 19 by new authors; Royal MCP 10k, Enable Abilities 5k [V] | Paid pricing not observed [?] | 10 | 8 | 13 | 5 | 5 | 4 | 6 | 5 | **56** |
| 4 | WordPress EU cookie/legal-compliance plugin | EU/EEA, Germany | WordPress.org search | Brand-dominated (Softaculous 400k, Brainstorm 70k, Elementor 40k); one independent at 3,000 [V] | Not observed [?] | 13 | 8 | 9 | 5 | 5 | 4 | 7 | 5 | **56** |
| 5 | Google Workspace Sheets connector | Global SMB ops | Workspace Marketplace | Unobservable [?] | Sync2Sheets self-reports ~$9K MRR [S] | 11 | 7 | 5 | 5 | 5 | 3 | 8 | 5 | **49** |
| 6 | Shopify EU-compliance app (GPSR) | EU sellers globally | Shopify App Store | Weak: most GPSR apps have 0 reviews [S] | $0–$29/mo [S] | 8 | 8 | 6 | 5 | 9 | 4 | 7 | 6 | **53** |
| 7 | Digital templates (Etsy/Gumroad) | US/UK/EU consumers and SMBs | Marketplace search | Unmeasured [?] | $15–$20 anecdotes [S] | 10 | 7 | 5 | 5 | 5 | 4 | 4 | 8 | **48** |
| 8 | Direct developer API (screenshot/PDF/tech-detect) with an MoR | Global developers | Organic search, API directories | Unmeasured [?]; Apify equivalent 175 users/30d [V] | Commodity pricing [S] | 11 | 6 | 5 | 7 | 7 | 3 | 9 | 6 | **54** |
| 9 | Chrome extension (freemium) | Global | Chrome Web Store search | Unmeasured (blocked) [?] | $5/mo anecdotes [S] | 10 | 7 | 5 | 7 | 6 | 3 | 7 | 6 | **51** |
| 10 | Confluence diagram/markdown apps | Global | Atlassian | Very weak: 28 Mermaid apps launched in 2026, 21 at ≤6 installs [V] | $50–$575/yr per 100 users [V] | 13 | 7 | 2 | 6 | 10 | 4 | 7 | 7 | **56** (rejected in scan #1) |
| 11 | Programmatic-SEO calculator/utility site | Global | Google search | Negative headwind [S] | Affiliate/ads [?] | 9 | 4 | 4 | 7 | 7 | 3 | 6 | 7 | **47** |
| 12 | Apify scrapers of LinkedIn/social/major platforms | Global | Apify Store | **Strongest traction** (harvestapi LinkedIn: 13,896 users/30d) [V] | PPE | — | — | — | — | — | — | — | — | **Gate fail:** LinkedIn sued Proxycurl (shut down) and ProAPIs in 2025 [S] ([Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/linkedin-battles-online-scrapers-in-perpetual-struggle-over-data)) |

---

## 5. Deep dives: top three

### 5.1 Lawful Apify pay-per-event tools (68)

- **Demand [V]:**
  - Apify reports **$1.7M paid out monthly** to **5,600** community developers ([partner page](https://apify.com/partners/actor-developers)).
    That is an *average* of ~$304/developer/month (inference: the mean is skewed and the median is unknown).
  - Apify states its most successful independent creators make **over $10,000 MRR** and "many others" over $1,000 a month
    ([help, 2025-10-22](https://help.apify.com/en/articles/8684010-make-money-publishing-your-actors-on-apify-store)).
- **Discoverability:**
  - Store search and categories.
  - AI agents can call Store actors through Apify's MCP integration, and 977 of the top 1,000 actors use pay-per-event,
    the model required for agentic payments [V] ([docs](https://docs.apify.com/platform/actors/publishing/monetize)).
- **Newcomer evidence (lawful subset) [V]:**
  - Email verifiers: BounceVerify 1,705 users/30d (created 2026-04-23); michael.g 505; xmiso 178; fatihtahta 138.
  - Website screenshot API: 175 (created 2026-06-14).
  - Bulk image downloader: 157. Sitemap extractor (Apify's own): 42.
  - Public-records actors are small: SAM.gov 21, SEC EDGAR 18.
- **Competition:** about 770 new actors a day, and copies are easy. Differentiation must come from reliability, data
  quality, price per event, or a data source others can't access lawfully. That last one is not yet identified [?].
- **Economics [H]:**
  - Payout = 0.8 × user spend − platform cost.
  - Monthly *user spend* needed for $8k–$10k take-home at a 25% placeholder tax, by platform-cost share:

    | Platform cost share | User spend needed per month |
    |---|---|
    | 10% | $15.4k–$19.2k |
    | 25% | $19.6k–$24.4k |
    | 40% | $26.9k–$33.6k |

  - Payout needed: $10.8k–$13.4k a month, about 35–44× the average developer payout.
- **Risks:**
  - Revenue per user unobservable before publishing.
  - Price race: verification is already ~$0.85/1k.
  - Platform dependency: Apify retired the rental model on 2026-10-01 [S] (first-scan search results).
  - Email verification needs SMTP infrastructure and IP reputation; feasibility unverified [?].
  - Customers may use the tool for cold outreach. That is their acquisition, not ours, but note it.
- **Seller side:** individual or company with KYC; PayPal/wire payouts [S]. Per-country list [?].
- **Cheapest validation:** see §6.

### 5.2 Jira Cloud time-in-status / flow reporting (66)

Carried over from `2026-10-21-jira-reports-deep-dive.md`, unchanged:
- **Strongest economics:** 100-user tier $500–$2,260/yr; 156–297 paying sites needed at $550–$840.
- **Payment infrastructure:** Atlassian bills customers and charges a 0% fee on the first $1M.
- **Weakest newcomer evidence:** cohort median 1 install; 2 independent winners.
- **Decision there:** run the 60-day Atlassian cohort test.
- Ranked second because unit economics and payments are excellent but newcomer reachability is the weakest of the top 3.

### 5.3 WordPress.org freemium plugin (56; MCP/AI connector or EU compliance)

- **Newcomer evidence [V]:**
  - The MCP/AI-connector niche is the most open WordPress niche measured: 19 plugins by new authors reached ≥100 installs.
    Royal MCP reached 10,000 in about 9 months; Enable Abilities for MCP 5,000; WSP MCP 2,000.
  - **But** WordPress.org itself now ships "MCP Adapter" (50,000) and "AI" (60,000), so the core project is commoditising the niche.
- **Economics [H]:**
  - At $49/$99/$199 a year with ~8% MoR fees, the target needs **706–3,576 active paid licences**.
  - At the 1–2% free-to-paid conversion vendors cite [S], that means **35k–358k active installs**.
  - The best measured independent newcomer has 10k. **The target is out of reach on observed newcomer outcomes.**
- **Risks:** support load; WordPress core competition; legal-accuracy liability for compliance plugins.

---

## 6. Cheapest decisive validation (no outreach, no ads, ~$0)

**Step 1: shadow cohorts (zero code; already started, baselines saved).**

| Cohort | Baseline (2026-10-21) | Re-measure | Pass | Fail |
|---|---|---|---|---|
| Apify: 1,309 sampled actors created 2026-10-04 → 10-21 (`data/apify_cohort_snapshots.csv`) | 38 >10 users; 10 >100 users | Day 30 and 60 | ≥10 of the sample >100 users at day 60 (traction persists) | Most early users vanish (≤3 >100 users) |
| Atlassian: 152 Jira report apps (`data/cohort_snapshots.csv`) | Independents: median 1; 0 ≥100 | Day 30, 60 and 90 | ≥15% ≥25 installs and ≥3 ≥100 at day 60 | Median ≤3 and none ≥100 |

**Step 2 (needs your approval, because it means publishing a small tool):**
- Publish **one** lawful pay-per-event Apify actor: a utility that processes only inputs the customer supplies, scraping no third-party platform.
- Price it transparently per event.
- **Measure** in Apify's developer insights: users/30d, paying runs and actual revenue at day 30 and day 60.
  This is the only way to get real willingness-to-pay data, because no channel publishes it.
- **Success:** ≥50 users/30d and ≥$100 revenue by day 60, with a rising trend.
- **Failure:** <10 users/30d at day 60.
- **Cost:** Apify free plan; build time only.

Not counted as evidence: likes, stars, waitlists, or users/installs without revenue.

---

## 7. Execution report

- **A. Learned:**
  - Only Apify shows large, measured, recent newcomer traction, but mostly in scraping that VentureScout excludes.
  - WordPress shows moderate newcomer traction with poor monetisation maths.
  - Atlassian has the best economics with the worst newcomer evidence.
  - Chrome, Workspace and digital marketplaces remain **unmeasured**, not disproven.
- **B. Best current opportunity:** lawful Apify pay-per-event tools (68). Low–moderate confidence.
- **C. Evidence vs assumptions:** newcomer counts, pricing and payout totals are [V]. Revenue per user, platform-cost
  share, the tax rate and per-country payout support are [H]/[?].
- **D. Economics:** Apify needs $15k–$34k/month of user spend, depending on platform-cost share. Jira needs 156–297 paying sites
  at $550–$840. WordPress needs 35k–358k active installs.
- **E. Distribution:** marketplace search and AI-agent tool discovery (Apify), and marketplace search (Atlassian, WordPress). All self-serve.
- **F. Next three actions:**
  1. Re-measure both cohorts at day 30 (~2026-11-20).
  2. Measure Chrome Web Store newcomers from an accessible data source, closing the largest "unmeasured" gap.
  3. Shortlist 3 lawful Apify tool ideas with demand evidence (existing paid actors with recent users and visible complaints).
- **G. Your immediate action:** decide whether to approve Step 2 (publishing one small lawful Apify actor as a paid-demand probe)
  after the day-30 check. Nothing else is needed from you now.
- **H. Avoid:**
  - scraping LinkedIn/social/Google-style platforms (legal gate);
  - building Jira or WordPress products before their cohort tests pass;
  - forming a foreign company;
  - treating users or installs as revenue.
- **I. Decision:** **Gather more evidence.**

## Sources (accessed 2026-10-21)

- Apify: [monetisation docs](https://docs.apify.com/platform/actors/publishing/monetize) · [payout FAQ](https://help.apify.com/en/articles/10057167-questions-regarding-payouts) · [creator earnings](https://help.apify.com/en/articles/8684010-make-money-publishing-your-actors-on-apify-store) · [partner page](https://apify.com/partners/actor-developers) · Store API `api.apify.com/v2/store`, `v2/acts/{id}`
- WordPress.org plugin API `api.wordpress.org/plugins/info/1.2/`
- Atlassian: previous reports in this folder
- Shopify: [revenue share](https://shopify.dev/docs/apps/launch/distribution/revenue-share) · [AppJubilee report](https://www.appjubilee.io/shopify-app-store-report-2026) (third-party)
- Payments: [Paddle sellers](https://developer.paddle.com/partners/embed-billing/get-started/supported-sellers) · [Lemon Squeezy countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries) · [Stripe India invite-only](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india) · [Stripe Managed Payments changelog](https://docs.stripe.com/changelog/dahlia/2026-04-22/managed-payments.md) · [Freemius countries](https://freemius.com/help/documentation/selling-with-freemius/supported-countries.md)
- Legal: [Bloomberg Law on LinkedIn scraping suits](https://news.bloomberglaw.com/artificial-intelligence/linkedin-battles-online-scrapers-in-perpetual-struggle-over-data)
- Search: [Seer Interactive AIO CTR](https://www.seerinteractive.com/blog/aio-impact-on-google-ctr-september-2025-update)
