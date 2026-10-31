# Developer-service (option E) desk check (2026-10-31)

Three directions from the pasted plan. Sources: vendor pricing pages, web search (one engine, one snapshot),
RDAP domain dates, npm downloads API (last month, fetched 2026-10-31).

## Summary

| Direction | Concrete form checked | Verdict |
|---|---|---|
| 1. API failure recovery | Webhook / retry / dead-letter infrastructure | **Reject**: crowded, falling prices, trust barrier |
| 2. Developer data infrastructure | Embeddable CSV/Excel import widget | **Weak lead**: price gap is real but newcomers already fill it; newcomer traction ~0 |
| 3. Automated API maintenance | Monitor third-party APIs for breaking changes | **Reject**: flood of 2025–26 newcomers and free tools; best-known player archived |

## 1. API failure recovery

- Svix (pricing page): Free to 50k messages/month; Basic from $20/month; Professional from $490/month.
- Hookdeck (pricing page): Developer $0 (10k events); Team from $39/month; Growth from $499/month;
  $3 per extra 100k events. Retries included; "Issues Management" on all plans.
- Upstash QStash: $1 per 100k messages, DLQ and replay by default (Upstash's own blog). Inngest Pro from $99/month
  (same source). AWS Lambda durable functions and Google Cloud Tasks cover the same need inside the cloud.
- **Why reject:** prices are already near cost, free tiers are generous, and buyers trust this layer only to vendors
  with uptime history. A solo newcomer has no edge.

## 2. Developer data infrastructure: CSV import widget

**Paid demand exists:**
- Flatfile and OneSchema: quote-based (competitors cite Flatfile historically from $799+/month; unverified).
- CSVBox: free tier; competitor cites $499+/month entry (unverified). Dromo: transparent pricing (not checked).
- ImportKit (newcomer, importkit.app): Free 100 rows; Starter €49/month (10k rows); Pro €149/month (100k rows);
  AI field mapping; "Powered by ImportKit" badge removed only on Pro. Billing via Lemon Squeezy.

**Usage signal (npm downloads, last month).** Downloads include CI installs and are not customers.

| Package | Downloads |
|---|---|
| @oneschema/react | 869,446 |
| @flatfile/react | 476,557 |
| @usecsv/react | 160,828 |
| @csvbox/react | 99,386 |
| react-spreadsheet-import (open source) | 89,331 |
| react-csv-importer (open source) | 69,364 |
| dromo-uploader-react | 55,452 |
| csv-import-react | 20,625 |
| **@importkit/react (newcomer)** | **28** |

- **Reading:** the "cheap self-serve tier for small SaaS" gap is real and already targeted. The one newcomer measured
  has essentially no installs. Open-source importers cover the free end.
- A wedge would need something incumbents lack (e.g. reliable AI mapping for messy real-world files). Not established.

**Math (illustrative):** $15k–$18k monthly revenue = 307–368 customers at $49, or 101–121 at $149.

## 3. Automated API maintenance

- Newcomers: FlareCanary (domain 2026-03-16; free up to 5 endpoints, paid tiers not stated), Diffmon (2025-12-16),
  DeprecationWatch and Hound (open source, PyPI), PageCrawl (general change monitor), oasdiff (open source CLI +
  hosted service, "OpenAPI Sync" provider-change alerts).
- **Optic, the best-known tool, was archived in January 2026** (per the DeprecationWatch listing; reason not checked).
- **Why reject:** many builders, free tools, no visible payer. Builders liking a problem is not buyers paying for it.

## Gates

| Gate | 1 | 2 | 3 |
|---|---|---|---|
| G1 acquisition without outreach | Plausible (docs, npm) | Plausible (npm, "X alternative" search, badge) | Plausible |
| G2 lawful | Pass | Pass (customer data: GDPR processor duties) | Pass |
| G3 paid demand + usage | Pass, but saturated | **Pass** (incumbent pricing + downloads) | **Not met** |
| Newcomer traction | Not measured | **Fail on one data point** (28 downloads/month) | Not measured |

## Next $0 check (only if continuing with #2)

Measure newcomer traction properly: list every CSV-importer package first published since 2025-04-22 on npm and its
monthly downloads. Pass = ≥3 newcomers above 1,000 downloads/month. Otherwise park option E.
