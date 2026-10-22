# Alternative data sources for the newcomer-revenue question (2026-10-22)

## Verdict: **INSUFFICIENT EVIDENCE AVAILABLE from free, terms-compliant sources**

No free source we can use within its terms shows all three for the same business:
1. verified revenue above $3,000 a month;
2. a launch date of 2025-04-22 or later;
3. a channel we can check ourselves.

So the threshold cannot be tested for any business-model/channel combination: **≥5 qualifying newcomers with verified MRR
>$3,000.** Per the rule, this is reported as insufficient evidence. **The threshold is unchanged.**

The sources split into three groups, and none joins them up:
- **Newcomer lists** (full denominators, failures included) with **no revenue**: Show HN, Uneed, WordPress.org, JetBrains,
  Shopify, Atlassian.
- **Verified revenue** behind **restrictive terms**, or one-off sales rather than MRR: Flippa, Envato, Etsy, TrustMRR.
- **Channel stories** that are **founder claims only**: Starter Story, X posts.

## Method

- Four parallel desk-research passes, each limited to about 10 pages or API calls per source.
- No accounts, payments, bulk collection or working around blocks.
- Page content was treated as data, not instructions.
- A 403 or other block is recorded as *inaccessible*, not as negative evidence.
- I re-checked the figures marked ✔ myself on 2026-10-22. The other figures come from the research passes and carry their
  URLs.

**Channel-evidence grades:**
- **Observed placement:** we can see the business where customers would find it.
- **Platform-attributed:** the platform is the storefront, and the sales happen on it.
- **Founder claim only:** nothing we can check independently. This grade alone cannot pass the distribution gate.

## Ranked sources

Each row lists, in order: launch date / revenue evidence (who verifies it) / channel grade / terms / denominator.

| Rank | Source | What it offers | Usable for |
|---|---|---|---|
| 1 | **Hacker News Show HN** (Algolia API) | `created_at` / no revenue / none / free, no auth, nothing found forbidding research / **yes, 2,644 launches in May 2026 ✔** | Denominator of software launches |
| 2 | **Uneed** | Launch date per tool / no revenue / none / terms target vote and comment automation, not reading / **11,275 tools ✔**; monthly lastmod counts May–Sep 2026: 486, 578, 663, 676, 850 ✔ | Denominator |
| 3 | **JetBrains Marketplace** | First release via the API / downloads only / observed placement / public JSON API, but the website ToS bans "data mining, robots" / **paid plugins sorted by publish date ✔** (newest paid plugin first published 2026-10-18, 13 downloads) | Denominator of paid plugins |
| 4 | **WordPress.org plugins** | `added` / active installs, no billing / observed placement / public API / **76,417 ✔** | Denominator (free plugins) |
| 5 | **Envato Market** | "Created N days/years ago" / **lifetime sales counted by the platform** × list price / platform-attributed / API terms 11.2 ban "data mining, robots…"; robots blocks `?sort=` and `?sales`; Market terms returned 403 / yes (Newest) | The only place where sales verified by the platform and newcomers appear together. **One-off sales, not MRR.** Item pages returned 403 when I re-checked |
| 6 | **Flippa** | Business age in years (seller-set) / "Data Verified" monthly revenue from connected Stripe etc. / none / terms ban "data mining, robots" and building "your own database" from it / for-sale businesses only | Verified revenue for businesses being sold; only hand review of a few listings is defensible |
| 7 | **Starter Story** | Founder narrative / self-reported / founder claim only / no scraping clause / curated winners | Leads and channel hypotheses only |
| 8 | **Shopify App Store** | "Launched" date / reviews and pricing, no revenue / observed placement / ToS bans robots and scrapers / 29,024 apps in the sitemap | Denominator by hand only |
| 9 | **Etsy (API)** | `create_date` / lifetime shop sales counted by the platform (physical and digital mixed) / platform-attributed / needs an app key; reported ban on analytics use (UNVERIFIED) / partial | Not usable without reading the terms directly or Etsy's permission |

**Weak or unusable:**

| Source | Reason |
|---|---|
| Product Hunt | API needs an account; "must not be used for commercial purposes" |
| BetaList | Terms forbid copying |
| Gumroad | `sales_count` is opt-in (null on samples) |
| Indie Hackers | 403; robots blocks ClaudeBot |
| There's An AI For That | robots blocks ClaudeBot |
| Acquire, Microns, Empire Flippers | Gated, or terms forbid even manual copying or non-purchase use |
| Unity, Creative Market, Notion, Framer, Webflow, Wix, Zapier | No sales counts |
| Google Workspace, HubSpot, Google Play, Apple | Installs or ratings only |
| Baremetrics Open Startups, open-startup lists | 5–25 mostly old entries |
| X | ToS bans scraping |
| Udemy, Fab, Peerlist, Microlaunch, Figma, monday.com, Microsoft website | Inaccessible or disallowed from here |

**Date corroboration:** RDAP domain registration is usable at low volume; it is a lower bound if the domain predates the
product. The Wayback CDX API could not be reached from here.

## Why the three requirements fail together

1. **Verified newcomer revenue:**
   - **Monthly, subscription:** only TrustMRR (restricted, see `trustmrr-api-compliance.md`) and Flippa's "Data Verified"
     listings show provider-verified revenue at any scale. Flippa covers only businesses being sold, and its terms bar building
     a dataset.
   - **One-off sales:** Envato shows sales the platform counts itself, but as lifetime totals.
2. **Channel evidence:** the best grade any free source gives is *observed placement* (marketplaces) or *platform-attributed*
   (Envato, Etsy). Those two marketplaces are the only places where the storefront and the channel are the same and verifiable.
   Everywhere else, channels are founder claims only.
3. **Replicable distribution:** launch directories show the launch only. Show HN or Uneed attention on launch day is not
   ongoing acquisition (inference).

**Survivorship:**
- Revenue sources show winners only.
- The denominator sources show failures but no revenue.
- So no source gives a newcomer success *rate* together with revenue. Our own Atlassian/Apify/WordPress cohorts remain the
  only base-rate evidence, and they measure installs or usage.

## Decisions this raises (for the founder)

1. **Threshold definition (open, unchanged).** If one-off platform-counted sales averaging over $3,000 a month over at least
   3 months were accepted (Option 2), Envato could in principle test a "marketplace digital product" combination.
   - **Arithmetic check:** 1,000 sales × $59 ÷ 18 months = $3,278/month gross, before Envato's author fee. It is still
     lifetime-averaged, not current monthly revenue.
   - **Access:** Envato's Market terms must first be read directly (they returned 403), and any sample must be hand-sized.
2. **TrustMRR permission request.** The alternatives have now proved inadequate on revenue verification, which was the
   condition you set for using this backup. The draft scope is in `trustmrr-api-compliance.md` §6.
3. **Product Hunt account.** This only adds another denominator, which we already have from Show HN and Uneed. Not recommended.

## Not done

- No dataset was built.
- No business model was shortlisted, validated or rejected from these sources.
