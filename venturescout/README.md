# VentureScout

A repeatable opportunity-discovery workflow. Its main rule: **prove distribution before building anything.**

```
venturescout/
├── README.md                      method, gates, scoring
├── reports/                       one dated report per research session
└── scanners/                      deterministic data pulls from public marketplace APIs
    ├── atlassian_entrant_scan.py   every Jira/Confluence Cloud app: categories, installs, rating, first release
    ├── atlassian_entrant_report.py where new entrants actually get installs (per category)
    └── apify_store_scan.py         Apify Store actors by popularity, 30-day users, pricing model
```

## Gates, in order (an idea that fails a gate stops there)

1. **Paid demand.** Someone already pays for a comparable solution, shown by public pricing plus a usage signal
   (installs, users, reviews). Search interest alone does not count.
2. **New-entrant discovery.** In the target channel, apps or products launched in the last 12–18 months
   have reached meaningful usage. If dozens of recent entrants sit near zero, the channel is closed to
   newcomers no matter how good the product is. *This gate killed both Atlassian candidates in the first scan.*
3. **Specific unmet need.** Recent (≤12 months) complaints about incumbents name a fixable gap.
4. **Economics.** The number of paying customers needed for the take-home target is plausible relative to
   the category leader's observable footprint.
5. **No personal selling, no paid ads.** Customers find, try and buy the product without outreach.

## Scoring (100 points)

| Category | Weight |
|---|---|
| Evidence of real customer demand | 20 |
| Organic or marketplace distribution potential (scored on *new-entrant* evidence) | 20 |
| Differentiation | 10 |
| Revenue potential and unit economics | 15 |
| Competition and defensibility | 10 |
| Solo-founder feasibility | 10 |
| Startup cost and operational simplicity | 5 |
| Automation potential | 5 |
| Recurring demand | 5 |

Change from the brief: the distribution score uses *new-entrant* traction rather than incumbent traction.
AI-assisted coding has made building cheap, so marketplaces now flood within months, and an incumbent's
installs show that demand exists, not that a newcomer can reach it.

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
```

Both use public, unauthenticated, read-only endpoints. Keep the request rate modest.
