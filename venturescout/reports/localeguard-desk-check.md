# LocaleGuard desk check (2026-10-30)

## Decision: **do not build the free hreflang checker as the entry point**

The free checker LocaleGuard's Phase 0 relies on is a commodity. The only gap found, scheduled locale-regression
monitoring for small teams, has no demand evidence yet.

## 1. Free hreflang / i18n checkers already rank (one search engine, US, one snapshot)

| Tool | What it does free | Domain registered (RDAP) |
|---|---|---|
| Swetrix | hreflang codes, x-default, canonicals, duplicates, return links | 2021-07-22 |
| u2l.ai | hreflang extraction + return-link check, no signup | **2026-01-24** |
| VitalSentinel | hreflang checker (free tool) | **2025-10-10** |
| MultiLipi | hreflang detector, missing-URL scan | 2024-03-04 |
| bfotool | hreflang validator, alternate URLs live | 2019-09-11 |
| cmlabs | web tool + Chrome extension | not returned |

Also found: Chrome extensions, Moda generator/validator, several thin promotional pages (write.as, Notion).

- **Young domains do appear** (2 of 5 dated, 2025-10 and 2026-01). A new tool page can be seen.
- **But the free tool is undifferentiated.** At least six already do the core checks free.
- Visibility is not traffic. No traffic or conversion data exists for any of them.

## 2. Code-level checks are free and open source

Missing-key checks in CI already exist: `@lingual/i18n-check`, activist-org `i18n-check`,
`i18next-resources-validator-action`, Laravel/Symfony checkers, `missing-translation` (npm), `i18n-cleaner`.
LocaleGuard's "missing translations" feature competes with free tools developers already install.

## 3. Paid neighbours (pricing pages, 2026-10-30)

| Vendor | Product | Price | Does scheduled locale-regression monitoring? |
|---|---|---|---|
| Loqalit (domain 2025-12-29) | Agentic localization QA, Chrome extension, Crowdin/Phrase sync | $9.60–$319/mo; no free plan | Not stated |
| VitalSentinel | 12 monitors (uptime, site health crawl, page monitoring, sitemap…) | Free; $39–$449/mo | hreflang not mentioned in plans |
| MultiLipi | AI website translation + multilingual SEO | Free; $19–$499/mo | "Health Check Monitoring" listed, scope unclear |
| DSK Translation Check | Shopify missing/outdated translations | $4.99/mo | Shopify only |

## 4. What survives

- **Possible gap:** monitoring that compares each scan against the last healthy one, triggered by deploys,
  across locales. Not found as a standalone product in this check (absence in a few searches is not proof).
- **Risk:** website-translation platforms (MultiLipi, Weglot-type) and SEO monitors (VitalSentinel) can add this as
  one more check. Their existing customers are the same buyers.
- **Unverified:** whether anyone searches for "localization regression monitoring". Results for that query were
  vendor guides and patents, not tools, which suggests low search demand (inference).

## 5. Gates (VentureScout README)

| Gate | Result |
|---|---|
| G1 Acquisition fits constraints | Plausible (search, marketplace), unproven |
| G2 Lawful | Pass, with domain verification before scheduled scans |
| G3 Paid demand (pricing + usage signal) | **Not met** for the monitoring gap. Pricing exists for neighbours, no usage signal |

## 6. Next step options

1. **Park LocaleGuard.** Recommended unless option 2 finds a signal.
2. $0 check: look for evidence of demand for the narrow gap (forum/GitHub issues asking for locale regression alerts,
   reviews of Loqalit/MultiLipi/Weglot complaining about broken locales after deploys). Pass = ≥10 independent
   requests in the last 24 months.
