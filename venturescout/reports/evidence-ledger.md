# Evidence ledger

**Evidence types:**
- **P** — primary source (official docs, policy, pricing, filing)
- **D** — our own pull from a public API (data in `data/`)
- **S** — secondary or community source
- **V** — vendor self-claim

**Confidence:** H / M / L. "Checked" = date accessed.

## A. Channel mechanics, eligibility and payments

| # | Claim | Source | Checked | Type | Conf. | Limitations |
|---|---|---|---|---|---|---|
| A1 | Individuals may hold an Atlassian partner profile | [Become a partner](https://developer.atlassian.com/platform/marketplace/become-a-partner/) | 2026-10-21 | P | H | Country-specific eligibility not stated |
| A2 | Atlassian KYC (Stripe Identity, ID document, selfie) before any app upload, free apps included | [Partner due diligence](https://developer.atlassian.com/platform/marketplace/partner-due-diligence/) | 2026-10-21 | P | H | — |
| A3 | Atlassian payouts ~30 days after month-end to a bank account in partner's name; $500 minimum; Atlassian may withhold tax | [Partner Agreement, rev. 2025-12-01](https://www.atlassian.com/licensing/marketplace/partneragreement) §4.4, §4.7 | 2026-10-21 | P | H | Supported payout countries not listed |
| A4 | Forge apps pay 0% revenue share on first $1M lifetime revenue (from 2026-01-01) | [Atlassian blog](https://www.atlassian.com/blog/developer/updates-to-marketplace-revenue-share-2026) | 2026-10-21 | P | H | "Temporary and may change" |
| A5 | Forge free allowance 200k GB-s/month per app; overage $0.000025/GB-s | [Forge pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/) | 2026-10-21 | P | H | Page updated 2026-08-12 |
| A6 | Non-US Atlassian partners need W-8BEN or face 30% withholding | [Community thread](https://community.developer.atlassian.com/t/individual-developer-no-registered-company-whats-the-minimum-verification-needed-to-publish-a-paid-via-atlassian-app/102404) | 2026-10-21 | S | M | Not official documentation |
| A7 | Atlassian Marketplace lifetime sales >$2B | [Atlassian Q2 FY22 release (SEC)](https://www.sec.gov/Archives/edgar/data/1650372/000165037222000003/ex991q2fy22.htm) | 2026-10-22 | P | H | Dated 2022; ecosystem-wide, not per category |
| A8 | Apify creator receives 80% of user fees minus platform usage cost; 18+; companies via authorised person | [Store Publishing Terms, updated 2026-09-15](https://docs.apify.com/legal/store-publishing-terms-and-conditions) §10.2.1 | 2026-10-22 | P | H | No country list |
| A9 | Apify payouts: PayPal/Wise ≥$20, other methods ≥$100; KYC for individuals (legal ID) or companies; invoices on the 11th, paid days 21–25; actors whose price doesn't cover platform costs earn $0 that month | [Monthly payouts](https://docs.apify.com/actors/publishing/monetize/monthly-payouts.md) | 2026-10-22 | P | H | Tax/VAT handling not covered |
| A10 | Apify paid out $1.7M "last month" to 5,600 community developers | [Partner page](https://apify.com/partners/actor-developers) | 2026-10-21 | P/V | M | Month unstated; mean ≈ $304/developer, median unknown |
| A11 | Apify's most successful independent creators exceed $10k MRR; "many" exceed $1k/month | [Help article, 2025-10-22](https://help.apify.com/en/articles/8684010-make-money-publishing-your-actors-on-apify-store) | 2026-10-21 | V | M | No counts |
| A12 | Shopify: 0% revenue share on first $1M lifetime, then 15%; $19 registration | [shopify.dev](https://shopify.dev/docs/apps/launch/distribution/revenue-share) | 2026-10-21 | P | H | — |
| A13 | Paddle sells for sellers in "over 200 countries and territories", sanctioned countries blocked | [Paddle](https://developer.paddle.com/partners/embed-billing/get-started/supported-sellers) | 2026-10-21 | P | M | Full list behind login |
| A14 | Lemon Squeezy bank payouts in a listed set of countries; PayPal in 200+ | [Docs](https://docs.lemonsqueezy.com/help/getting-started/supported-countries) | 2026-10-21 | P | H | Undated page |
| A15 | Stripe accounts in India are invite-only (since May 2024) | [Stripe support](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india) | 2026-10-21 | P | H | — |
| A16 | Freemius pays out to 190+ countries; 4.7% + gateway fees | [Freemius](https://freemius.com/help/documentation/selling-with-freemius/supported-countries.md) | 2026-10-21 | V | M | Fees not re-verified |

## B. Newcomer traction (own measurements)

| # | Claim | Source | Observed | Type | Conf. | Limitations |
|---|---|---|---|---|---|---|
| B1 | Age 0–17 days: Atlassian 3.6% ≥10 installs (n=83); WordPress 3.2% ≥10 active installs (n=2,154); Apify 3.3% ≥10 users/30d (n=13,084) | `cloud_scan.json`, `wp_new.json`, `apify_newest.json` | 2026-10-21 | D | M | Different metrics; Apify users include free-credit/self runs |
| B2 | Age ~6 months (launched April 2026): Atlassian independents 12.1% ≥10, 0.6% ≥100 (n=165); WordPress 30.6% ≥10, 4.4% ≥100 (n=1,063) | same | 2026-10-21 | D | M | Survivor bias (removed products absent) |
| B3 | Age ~12 months (launched Oct 2025): Atlassian independents 17.8% ≥10, 0% ≥100 (n=45); WordPress 47.4% ≥10, 13.3% ≥100 (n=548) | same | 2026-10-21 | D | M | Smaller surviving cohort suggests attrition, so rates are inflated |
| B4 | Jira report cohort (152, launched last 90 days): independents median 1 install, 0 at ≥100 | `cohort_snapshots.csv` | 2026-10-21/22 | D | H | Ages 0–90 days |
| B5 | Apify "310 actors created since 2025-04-21 at ≥100 users/30d" is a **survivor count without a denominator** | `apify_store_dated.json` | 2026-10-21 | D | H (that it is biased) | Earlier report presented it as a success rate; **corrected here** |
| B6 | Apify ~13k actors created in 17 days (≈770/day) | `apify_newest.json` | 2026-10-21 | D | M | Some may be quickly deleted or auto-generated |
| B7 | Lawful Apify categories: most have <100 combined users/30d across their top 10; nearly every top-10 actor was created 2025–26 | `apify_lawful_categories.json` | 2026-10-22 | D | H | Top-10 by relevance only |
| B8 | Lawful Apify primary-event prices ~$0.0005–$0.1, mostly $0.001–$0.02 | same | 2026-10-22 | D | H | Free-tier price shown; discounts lower it |
| B9 | WordPress: 22,572 plugins added in 18 months; 74% have 0 active installs | `wp_new.json` | 2026-10-21 | D | H | Bucketed counts |
| B10 | 2 of 16 dated domains ranking for 6 document-conversion queries were registered in 2024 | `serp_domain_ages.csv` | 2026-10-22 | D | L | Not Google; registration ≠ launch; tiny sample |
| B11 | Several 2025-era iOS apps rank in web results for statement-conversion queries | WebSearch results | 2026-10-22 | D | L | No usage data |

## C. Monetisation and pricing

| # | Claim | Source | Checked | Type | Conf. | Limitations |
|---|---|---|---|---|---|---|
| C1 | Jira report apps: 185 of 206 in top results are paid; 148 of those give the app free to ≤10-user sites; 100-user tier p25 $500 / median $790 / p75 $1,400 per year | `jira_niches.json` (live pricing API) | 2026-10-21 | D | H | List prices, not spend |
| C2 | No public Atlassian install-to-paid conversion data | [2021 thread](https://community.developer.atlassian.com/t/benchmark-for-cloud-conversion-rate-for-marketplace-apps/46694), [2026 thread](https://community.developer.atlassian.com/t/share-of-paid-licenses-among-active-installs-for-paid-cloud-apps/103089) | 2026-10-21 | S | H | Absence of evidence |
| C3 | Independent newcomer TypeSwitch "Flow Time Report": 244 installs at $1,650/yr (100 users) after ~17 months | `jira_niches.json` | 2026-10-21 | D | H | Paying share unknown |
| C4 | DocuClipper pricing: Starter $20.30/mo annual (60 pages), Business $111.30, Enterprise $279.30; 14-day trial; G2 4.7 (124 reviews); "10,000+" teams | [Pricing](https://www.docuclipper.com/pricing/) | 2026-10-22 | P/V | M | Customer count is a self-claim |
| C5 | WordPress freemium conversion "1–2%" typical | [Freemius](https://freemius.com/blog/freemium-business-model-wordpress/) | 2026-10-21 | V | L | Vendor-sourced |
| C6 | Shopify: "half the store has never earned a single review" | [AppJubilee](https://www.appjubilee.io/shopify-app-store-report-2026) | 2026-10-21 | S | L | Third-party method |
| C7 | AI Overviews cut informational-query CTR ~58–61% | [Seer](https://www.seerinteractive.com/blog/aio-impact-on-google-ctr-september-2025-update) | 2026-10-21 | S | M | Informational, not transactional |
| C8 | AIO share on commercial/transactional queries rose through 2025 | [ContextBolt summary of Semrush](https://contextbolt.com/ai-search-statistics/) | 2026-10-22 | S | L | Secondary; conflicting estimates |

## D. Legal and platform-terms

| # | Claim | Source | Checked | Type | Conf. | Limitations |
|---|---|---|---|---|---|---|
| D1 | LinkedIn sued Proxycurl (shut down) and ProAPIs (settling) over scraping | [Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/linkedin-battles-online-scrapers-in-perpetual-struggle-over-data) | 2026-10-21 | S | M | News coverage, not rulings |
| D2 | Apify may unpublish content violating its terms; actors must comply with law | [Publishing Terms](https://docs.apify.com/legal/store-publishing-terms-and-conditions) §2.2.4 | 2026-10-22 | P | H | Acceptable Use Policy not reviewed |

## E. Open questions (precise, with cheapest resolution)

| Question | Why it matters | Cheapest legitimate resolution |
|---|---|---|
| What share of Atlassian report-app installs pay? | Decides Jira unit economics (5× swing) | Only via your own app's vendor reporting after publishing (approval needed) |
| Do independent newcomers' installs grow by day 30/60/90? | Newcomer gate | Re-run trackers on 2026-11-20 / 12-20 / 2027-01-19 (free) |
| Can the founder's jurisdiction receive Atlassian / Apify payouts? | Eligibility gate before publishing | Atlassian Marketplace support request; Apify payout page shows options after sign-up (approval needed) |
| Do young sites win Google traffic for transactional document-conversion queries? | Organic-search newcomer gate | Expand SERP + RDAP study to 30–50 queries; check whether young domains have paid plans (free) |
| Does an AI assistant already solve statement-to-CSV adequately for free? | Defensibility | Test 3–5 sample public statements in a general AI assistant; record accuracy (free, iPhone-feasible) |
