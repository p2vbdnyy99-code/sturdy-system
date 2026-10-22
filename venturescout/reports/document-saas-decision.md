# Decision memo: document-to-spreadsheet SaaS (2026-10-22)

## Decision: **REJECT**

This applies to the generic document-to-spreadsheet SaaS as a path to $8k–$10k/month. The Jira candidate is unaffected and
stays under observation.

## 1. What has been verified

- **Paid offerings exist at $3 per document and $19–$279 a month.** Published pricing from DocuClipper, BankConv,
  invoicedataextraction.com and Bankstatemently.
- **One 2025 newcomer has Stripe-verified revenue.** Bankstatemently: $1,420 all-time, best month $458, $375 MRR from
  14 subscriptions at last sync ([TrustMRR](https://trustmrr.com/startup/bankstatemently.md)).
- **Young specialist domains appear in results.** Domains registered 2024 or later (RDAP) show up for 15 of 40
  purchase-intent queries on the tool's search engine.
- **A general-purpose model extracted 30 synthetic statements perfectly.** 779/779 rows, 30/30 reconciled, including scans.

## 2. What remains uncertain

- Organic traffic, conversion and churn for any newcomer. **None of these is measurable here.**
- Whether **free** consumer AI tools match the model tested.
- Performance on messy real-world statements.
- Your MoR eligibility. It is a risk only; no integration is recommended.

## 3. Test A: INCONCLUSIVE

| Screen | Threshold | Result | Met? |
|---|---|---|---|
| Visibility | ≥8 of 40 queries show an opening | 15 of 40 show a young specialist | Yes |
| Adoption | ≥3 newer products with verifiable adoption | 1 | No |
| Paid demand | ≥2 newer products with credible paid demand | 2 (Bankstatemently, OCR.so), both tiny | Borderline |

There is no evidence tying any customer to organic search.

## 4. Test B: STRONG AI-SUBSTITUTION WARNING (provisional)

- **Result:** the tested model made 0 critical errors across 30 documents.
- **Provisional because** the tool was not a verified free tier.
- **No differentiation gap** was observed. The remaining advantages (batching, QBO/Xero exports, privacy) are already sold by
  incumbents and recent entrants.

## 5. Is self-service acquisition credible?

**Only weakly.** Long-tail result pages with a working free converter are a plausible mechanism, and young sites are visible.
But the only newcomer with verified payments is tiny, and its channel is unknown.

## 6. Could the economics support the target?

- **On paper:** 434–539 subscribers at $29/mo (25% illustrative tax), with healthy 80–90% gross margins.
- **In practice:** that is ~27–34× the best verified newcomer month, in a crowded category, against free AI. **Not credible on
  current evidence.**

## 7. Three largest risks

1. **Free general-purpose AI already does the core job** (Test B). The paid product reduces to convenience features
   incumbents already provide.
2. **Crowded category with strong incumbents.** Bank statements have the most specialists of any category tested.
3. **No proof that organic visibility becomes paying customers.**

## 8. Cheapest next experiment (could reverse this decision)

**Free-tool replication, about 20 minutes, iPhone-feasible, $0.**
- **Steps:**
  1. Upload 5 of the synthetic statements to a free consumer AI assistant you already use: S05, S10 and S25 (scanned), S14
     (year-less dates spanning December→January) and S29 (4 pages, repeat across a page break). They are in
     `data/2026-10-22/doc_saas/testb/pdf/` and contain no real data.
  2. Use the exact prompt in `PROTOCOL.md`.
  3. Paste each JSON reply back to me and I will score it with `score.py`.
- **Confirm rejection if:** the free tool gets ≥99% of rows exact and reconciles all 5.
- **Reopen as VALIDATE if:** it gets <98% of rows exact, **or** fails reconciliation on ≥2 of the 5. Even then the next step
  would be a narrow, approval-gated product test, not a build.

## 9. Final decision

**REJECT**, because:
- the evidence indicates a substitute already solves the core problem adequately;
- the distribution route is unproven;
- verified newcomer economics are far below the target.

Per the rules, the opportunity is not kept alive because research has been invested. The free-tool replication above is the
only cheap result that would change this.

## What changes elsewhere

The VentureScout portfolio decision stays **RESEARCH FURTHER** (see `venture-decision.md`).
- The Jira cohort continues; next re-measure is day 30 on 2026-11-20.
- The Jira candidate is **not** declared a winner because this one failed.
