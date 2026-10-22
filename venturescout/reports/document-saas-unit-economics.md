# Document-to-spreadsheet SaaS: unit economics (2026-10-22)

Model: `models/docsaas_economics.py`. Labels used below:
- **OBSERVED:** a competitor's published list price, which proves an asking price, not sales.
- **VERIFIED:** payment-provider-verified revenue.
- **ASSUMPTION:** needs verification.

## Pricing alternatives

| Model | Our hypothesis | Evidence | Closest comparables |
|---|---|---|---|
| Monthly subscription | $29/mo for ~100 pages | OBSERVED: BankConv $29 monthly / $19 annual (500 pages); DocuClipper Starter $20.30 on annual billing (60 pages) | BankConv, DocuClipper, Bankstatemently (from $25/mo) |
| Pay per document | $3 per ≤10-page statement | OBSERVED: BankConv $2.99 (+$0.20/page over 10) | BankConv |
| Prepaid credits | $0.08/page (1,000 pages for $80) | OBSERVED: invoicedataextraction.com packs ($0.12 → $0.055/page); Bankstatemently packs from $7.50 | invoicedataextraction, Bankstatemently |

**Paid demand at these prices for a newcomer:** VERIFIED only for Bankstatemently. It made $1,420 all-time, and its best month
was $458 (TrustMRR, Stripe).

## Cost assumptions (all ASSUMPTION)

- **OCR/LLM processing:** $0.002, $0.01 or $0.03 per page (low/mid/high). Verify on the chosen model provider's pricing page.
- **Merchant of record (MoR) fee:** 5% + $0.50 per transaction. Verify on the chosen MoR's page; Paddle's seller coverage is
  confirmed in ledger A13, its fee is not.
- **Refunds and chargebacks:** 3% of revenue.
- **Fixed costs:** $250/month (hosting, storage with automatic deletion, monitoring, domain, email, accounting help).
- **Not included:** security audits. Accounting firms may ask for SOC 2 (DocuClipper advertises SOC 2 Type II), which can
  cost far more than this model allows.
- **Support:** founder time, not costed.

## Gross margin by usage (mid case unless noted)

| Model | Revenue per customer/month | Contribution margin at $0.002 / $0.01 / $0.03 per page |
|---|---|---|
| $29 subscription (100 pages) | $29.00 | 90% / 87% / 80% |
| $3 per document (4 documents, 30 pages) | $12.00 | 75% / 73% / 68% |
| $0.08 per page (≈333 pages) | $26.67 | 89% / 79% / 54% |

## Paying customers needed for $8k–$10k/month take-home

Tax rates are **illustrative only**, not your rate.

| Model | 15% tax | 25% tax | 35% tax | Gross revenue needed (25% tax) |
|---|---|---|---|---|
| $29 subscription | 384–477 | **434–539** | 499–621 | $12.6k–$15.6k/mo |
| $3 per document | 1,105–1,375 | **1,249–1,554** | 1,437–1,789 | $15.0k–$18.7k/mo |
| $0.08 per page | 459–571 | **519–646** | 597–743 | $13.8k–$17.2k/mo |

## Illustrative acquisition funnel

All conversion rates below are **hypotheses**, not measurements. No visitor→paid rate for this category is public.

- **Churn replacement:** to replace churn at a steady state of 434–539 subscribers, you need 22–27 new paying customers a month
  at 5% monthly churn, or 43–54 at 10%.
- **Visitors needed for those replacements alone**, at 10% churn: 8.7k–10.8k a month at 0.5% visitor→paid; 4.3k–5.4k at 1%;
  2.2k–2.7k at 2%.
- **Reaching** that customer base takes more acquisition than holding it.

**Reality check:**
- The target gross ($12.6k–$15.6k/mo) is **~27–34 times** the best verified newcomer month ($458).
- No source available to me measures any newcomer's organic traffic.

**Cheapest test of the conversion assumption:** a live free converter with a paid tier, measured on real organic visitors.
It needs your approval (domain, MoR account, publishing). Desk research cannot supply it.

## Cash flow and other effects

- **Annual plans** pull cash forward but add refund exposure.
- **MoR payouts** run on a schedule (verify with the chosen MoR).
- **Chargebacks** in a financial-data tool can be costly.
- **Customer geography** (mostly US/UK/EU/AU, judging by competitor currencies and bank lists) is separate from your tax
  residence. MoR eligibility for your jurisdiction must be confirmed on official pages before use (see ledger A13–A16).

## Key unknowns that could invalidate the numbers

1. **Organic traffic** obtainable by a new site for these queries. **Not measurable here.**
2. **Visitor→paid conversion.** No data.
3. **Churn** for occasional-use tools (statements are monthly, but many users convert once).
4. **Free AI substitution.** Test B suggests it is high.
5. **Security and compliance costs** demanded by accounting buyers.
