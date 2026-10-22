# VentureScout

A repeatable opportunity-discovery workflow. Its main rule: **prove distribution before building anything.**

```
venturescout/
├── README.md                      method, gates, scoring
├── reports/                       one dated report per research session
└── scanners/                      deterministic data pulls from public marketplace APIs
    ├── atlassian_entrant_scan.py   every Jira/Confluence Cloud app: categories, installs, rating, first release
    ├── atlassian_entrant_report.py where new entrants actually get installs (per category)
    ├── apify_store_scan.py         Apify Store actors by popularity, 30-day users, pricing model
    ├── jira_niche_scan.py          top-N Marketplace results per search term: pricing, free tier, vendor age, bad reviews
    ├── jira_niche_report.py        per-term summary of the niche scan
    ├── jira_report_terms.txt       the 40 Jira report search terms
    ├── cohort_tracker.py           re-measures installs of a fixed cohort of new Atlassian apps (validation experiment)
    ├── wordpress_new_scan.py       every WordPress.org plugin added since a date, with active installs
    ├── wordpress_author_age.py     author's first plugin date (separates new independents from established brands)
    ├── apify_actor_age.py          adds creation dates to an Apify Store pull
    ├── apify_newest_scan.py        newest-first Apify actors (unbiased newcomer base rate; API caps at ~15k)
    ├── apify_cohort_tracker.py     re-measures 30-day users for a sampled Apify cohort
    ├── apify_category_scan.py      top-N actors per search term with users, creation date and per-event price
    └── apify_lawful_terms.txt      36 lawful-utility search terms
models/scenarios.py                 conservative/base/optimistic scenarios for the top-three candidates
models/income_model.py              paying sites needed per price/tax scenario + Forge cost scenarios
```

## Global-first principle (from 2026-10-21, v2)

Customer geography and the founder's jurisdiction are **separate variables**. Opportunities are chosen by
global evidence. Seller-side questions (eligibility, payouts, tax) are scored as **risks**, never used to narrow
the market search, and they are checked against official sources before any integration is recommended.
VentureScout never proposes forming a company abroad merely to bypass a restriction. It does so only after
weighing legal requirements, setup cost, ongoing compliance, tax and genuine operational benefit.

## Hard gates (fail any one → reject, whatever the score)

1. **Acquisition fits the constraints:** no paid ads, cold outreach, personal selling or sales meetings.
   Customers find, try and buy on their own.
2. **Lawful and within platform terms:** no products whose core is scraping platforms that prohibit it,
   bypassing access controls, or collecting personal data without a lawful basis.
3. **Paid demand exists:** public pricing plus a usage signal. Search interest alone does not count.

## Scoring v3 (100 points, from 2026-10-22): eight dimensions, scored separately

| # | Dimension | Weight |
|---|---|---|
| 1 | Verified demand and evidence of spending | 15 |
| 2 | Organic discoverability | 15 |
| 3 | **Newcomer traction** (consistent cohorts, age-matched, explicit denominators) | 20 |
| 4 | Seller eligibility and platform access | 10 |
| 5 | Payment and payout feasibility | 10 |
| 6 | Business structure and tax feasibility | 5 |
| 7 | Unit economics and income potential | 15 |
| 8 | Solo operating burden and durability | 10 |

Rules:
- A dimension without adequate evidence gets **at most half** its points.
- Differences of a few points are inconclusive when evidence is weak.
- The gates override the score.
- Newcomer rates must use a defined launch window, a full denominator and comparable product ages.
  Survivor lists (e.g. "top N by popularity") never count as success rates.
- History: v1 in scan #1; v2 on 2026-10-21 (weights 15/10/20/10/10/5/20/10).

Current outputs:
- `reports/venture-decision.md`
- `reports/global-opportunity-comparison.md`
- `reports/evidence-ledger.md`
- `reports/top-three-opportunity-investigations.md`
- `reports/prebuild-validation-plan.md`
- `data/COHORTS.md`

## Take-home formula

```
take_home = (gross − marketplace_fee − payment_fees − refunds − infra − tools − support) × (1 − tax_rate)
gross_needed ≈ take_home_target / (1 − tax_rate) + fixed_costs     (when the marketplace fee is 0%)
```

`tax_rate` is a placeholder until tax residency is confirmed with a qualified professional.

## Running the scanners

They need Python 3 and outbound HTTPS, so they run in a Claude Code cloud session, not on a phone:

```bash
python3 scanners/atlassian_entrant_scan.py             # writes cloud_scan.json (~15 min, ~13k requests)
python3 scanners/atlassian_entrant_report.py cloud_scan.json 2025-04-21 100
python3 scanners/apify_store_scan.py                   # writes store.json
python3 scanners/jira_niche_scan.py data/2026-10-21/cloud_scan.json scanners/jira_report_terms.txt niches.json
python3 scanners/jira_niche_report.py niches.json
python3 scanners/cohort_tracker.py data/2026-10-21/jira_report_cohort.json data/cohort_snapshots.csv   # day 30/60/90
python3 models/income_model.py
python3 scanners/wordpress_new_scan.py 2025-04-21 wp_new.json && python3 scanners/wordpress_author_age.py wp_new.json 100 wp_new_100plus.json
python3 scanners/apify_newest_scan.py 15000 apify_newest.json
python3 scanners/apify_cohort_tracker.py data/2026-10-21/apify_newest.json data/apify_cohort_snapshots.csv 10   # day 30/60
python3 scanners/apify_category_scan.py scanners/apify_lawful_terms.txt out.json 10
python3 models/scenarios.py
```

Both use public, unauthenticated, read-only endpoints. Keep the request rate modest.
