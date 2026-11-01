# Global opportunity comparison (v3, 2026-10-22)

This file supersedes `2026-10-21-global-opportunity-comparison.md`, which is kept for history.
Evidence IDs (A1, B2 …) refer to `evidence-ledger.md`.

## Answer first

**No candidate clears the bar for building.**
- The strongest is a **paid Jira Cloud reporting app on the Atlassian Marketplace (56/100)**.
- Next come a **search-led document-to-spreadsheet micro-SaaS (50)** and **lawful pay-per-event Apify utilities (50)**.
  The Apify utilities also fail the income model.
- Scores this close, on this much missing evidence, are **inconclusive**.
- **Decision: RESEARCH FURTHER** (see `venture-decision.md`).

## 1. Corrections to the previous report

| Previous claim | Problem | Corrected finding |
|---|---|---|
| "Apify: 310 newcomers ≥100 users, the only channel with large measured newcomer traction" | Survivor sample from the top-3,972-by-popularity list; **no denominator** (B5) | Age-matched at 0–17 days, Apify (3.3% ≥10 users), Atlassian (3.6% ≥10 installs) and WordPress (3.2% ≥10) are **indistinguishable** (B1) |
| "Lawful Apify tools are the strongest opportunity (68)" | Lawful categories were never measured directly | Measured on 2026-10-22: most lawful categories have <100 combined users across their top 10, at $0.001–$0.02 per event (B7, B8). The target needs 0.8M–16.8M billable events a month |
| "223 from developers new to the top listings" | "New to the top list" ≠ new developer | Dropped as an independence measure |
| Jira cohort day-1 snapshot | The app-detail endpoint started returning 0 | Rows quarantined; tracker fixed and re-measured (COHORTS.md) |

## 2. Distribution channels: can a newcomer be seen and paid?

| Channel | Launch dates public? | Adoption observable? | Newcomer result (consistent cohorts) | Platform handles payment? | Native/AI replacement risk |
|---|---|---|---|---|---|
| Atlassian Marketplace | Yes (version history) | Installs | 6-month independents: 12.1% ≥10, 0.6% ≥100 (n=165) (B2) | Yes; 0% fee on first $1M (A4) | Medium (Atlassian ships reports, Rovo AI) |
| Apify Store | Yes (`createdAt`) | Users/30d | 0–17 days: 3.3% ≥10 (B1); ~770 launches/day (B6) | Yes; 80% minus platform cost (A8) | High (AI agents, commodity) |
| WordPress.org | Yes (`added`) | Active installs | 6-month: 4.4% ≥100; 74% of all 18-month launches at 0 (B2, B9) | No; needs a merchant of record (MoR) (A16) | Medium (core ships AI/MCP) |
| Shopify App Store | Listing shows launch | Reviews only | Half of all apps have no reviews (C6, S) | Yes (A12) | Medium |
| Chrome Web Store | No | User bands | Not measured; **founder's own extensions failed**, so excluded | No | High |
| Google Workspace Marketplace | No | Install bands | Unobservable | Not confirmed | Medium |
| Microsoft AppSource / Office add-ins | Not found | Not found | Unobservable | Not assessed | Medium |
| Organic search (own site + MoR) | Domain RDAP only | Not without paid tools | 2 of 16 ranking domains registered 2024 (B10, weak) | Via MoR (A13–A15) | High for informational, lower for transactional (C7, C8) |
| Digital-product marketplaces (Etsy/Gumroad) | Partially | Sales counts on some pages | Not measured (automated collection would breach terms) | Yes | Medium |
| Data marketplaces (AWS/Snowflake/Datarade) | — | — | Not measured; buying is often sales-led (gate 1 risk) | Varies | Low–medium |
| Open source → hosted paid (GitHub) | Repo creation date | Stars, not usage | Not measured this round | Via MoR | Medium |
| MCP/agent-tool registries | Varies | Apify MCP usage | MCP category top 10: 182 combined users (B7) | Apify PPE only | High |

## 3. Business models scored (scoring v3, 100 points)

Weights: verified demand 15 · organic discoverability 15 · newcomer traction 20 · seller eligibility 10 · payment/payout 10 · structure/tax 5 · unit economics 15 · operating burden 10.

**Missing-evidence rule:** a dimension without adequate evidence gets ≤ half its points.

**Gates:**
- G1 = acquisition without ads or outbound
- G2 = lawful and within platform terms
- G3 = commercial evidence

Column abbreviations: Dem = demand · Disc = discoverability · New = newcomer traction · Elig = eligibility · Pay = payment/payout · Tax = structure and tax · Econ = unit economics · Burden = operating burden · Conf = confidence (L = low).

| # | Model | Customer geography | Distribution mechanism | Dem | Disc | New | Elig | Pay | Tax | Econ | Burden | **Total** | Gates | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Paid Jira Cloud reporting app** (time-in-status / flow) | Global Atlassian Cloud customers | Marketplace search and in-product "Explore apps"; self-serve trial, Atlassian billing | 10 | 10 | 6 | 6 | 7 | 3 | 7 | 7 | **56** | G1 ✓ G2 ✓ G3 ✓ (A7, C1) | L |
| 2 | **Search-led document→spreadsheet micro-SaaS** (statements/invoices to CSV/Excel) | US/UK/EU/AU bookkeepers and SMBs (by competitor currency support, C4) | Transactional search queries; free conversion tier → paid; MoR checkout | 10 | 5 | 4 | 7 | 8 | 4 | 7 | 5 | **50** | ✓ ✓ ✓ (C4) | L |
| 3 | **Lawful Apify pay-per-event utilities** | Global developers and AI agents | Store search, Apify MCP | 5 | 10 | 8 | 7 | 9 | 4 | 2 | 5 | **50** | ✓ ✓ G3 weak (B7) | M (that it is weak) |
| 4 | WordPress freemium plugin (MCP connector / EU compliance) | Global; EU for compliance | WordPress.org search → upgrade via MoR | 7 | 10 | 9 | 5 | 5 | 4 | 3 | 4 | **47** | ✓ ✓ ✓ | L |
| 5 | Open-source tool → hosted paid tier | Global developers | GitHub/package registries; permitted community posts | 7 | 7 | 4 | 7 | 8 | 4 | 6 | 4 | **47** | ✓ ✓ ? | L |
| 6 | Shopify app (merchant compliance/ops) | Global merchants; EU for GPSR | App Store search; Shopify billing | 8 | 7 | 5 | 5 | 7 | 3 | 5 | 5 | **45** | ✓ ✓ ✓ | L |
| 7 | Digital templates (Etsy/Gumroad) | US/UK/EU consumers and SMBs | Marketplace search | 7 | 8 | 4 | 5 | 5 | 4 | 3 | 8 | **44** | ✓ ✓ ✓ | L |
| 8 | Compliance calculators/validators site + paid API | EU/UK businesses | Organic search | 4 | 5 | 3 | 7 | 8 | 4 | 3 | 6 | **40** | ✓ ✓ weak (B7: VAT validation 7 users) | L |
| 9 | Google Workspace add-on | Global SMB | Workspace Marketplace | 7 | 7 | 3 | 5 | 4 | 3 | 5 | 4 | **38** | ✓ ✓ ✓ | L |
| 10 | AI-agent tools (MCP servers) | Global | Registries, Apify MCP | 3 | 6 | 6 | 7 | 6 | 4 | 2 | 4 | **38** | ✓ ✓ weak | L |
| 11 | Lawful paid datasets on data marketplaces | Enterprise, US/EU | Data marketplaces | 5 | 4 | 3 | 5 | 5 | 3 | 6 | 5 | **36** | **G1 risk** (sales-led) | L |
| 12 | Microsoft Office/Teams add-in | Global enterprise | AppSource | 5 | 5 | 3 | 5 | 4 | 3 | 4 | 4 | **33** | ✓ ✓ ? | L |
| 13 | Apify scrapers of LinkedIn/social/search platforms | Global | Apify Store | — | — | — | — | — | — | — | — | **Rejected** | **G2 fail** (D1) | M |
| 14 | Another browser extension | Global | Chrome Web Store | — | — | — | — | — | — | — | — | **Excluded** | Founder's own evidence; no new mechanism | M |

**Key evidence behind the top three:**
1. **Jira reports:**
   - Paid market: >$2B ecosystem sales (A7); 185 of 206 report apps paid; median $790/yr for 100 users (C1).
   - Weak newcomers: 0.6% of 6-month independents reach ≥100 installs (B2).
   - Install-to-paid unknown (C2), so unit economics is capped at 7.
2. **Document-to-spreadsheet SaaS:**
   - Real price points ($20–$279/mo) and reviews (C4).
   - Newcomer search data almost absent (B10), so discoverability ≤5 and newcomers ≤4.
   - General AI assistants are a direct substitute risk.
3. **Apify lawful utilities:**
   - Discovery for newcomers is real: top-10s are mostly new actors (B7).
   - Spending per category is tiny and prices are fractions of a cent, so unit economics scores 2.

## 4. What would change these rankings

- **Jira:** a day-60 cohort where ≥3 independent report apps reach ≥100 installs would raise newcomer traction from 6 to ~12. Real paid-conversion data from our own listing would replace the cap on unit economics.
- **Document SaaS:** a SERP study across 30–50 transactional queries showing ≥20% young domains with live paid plans would raise discoverability and newcomer scores. A free AI assistant converting statements accurately would lower defensibility and could reject it.
- **Apify:** no plausible observation within the lawful scope fixes the price × volume gap. It stays a side channel at most.
