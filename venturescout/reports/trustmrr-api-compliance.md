# TrustMRR API and compliance check (2026-10-22)

## Gate result: **NOT CLEARED. Study stopped before any data collection.**

The intended study (find business-model/channel combinations where ≥5 newcomers have verified MRR >$3,000, so the founder can
choose what to build) conflicts with, or is materially ambiguous under, four clauses of TrustMRR's API Acceptable Use Policy.
Per the study instructions, I did not request a key, call the authenticated API, page any listing, or build a dataset. The
pre-registered threshold (≥5 qualifying newcomers with verified MRR >$3,000 per combination) is unchanged.

**What would clear the gate:** TrustMRR's prior written permission for the specific use described in §6. Asking for it is an
external contact and needs your approval.

## 1. Sources read

All accessed 2026-10-22. Terms "Last updated: October 9, 2026" (`dateTime="2026-10-09"` in the page source).

| Page | URL |
|---|---|
| Terms of Service, §9 API Acceptable Use Policy | https://trustmrr.com/terms |
| API overview | https://trustmrr.com/docs/api |
| List startups | https://trustmrr.com/docs/api/list-startups |
| Get startup | https://trustmrr.com/docs/api/get-startup |
| FAQ (incl. "TrustMRR API (for developers)") | https://trustmrr.com/faq |

Page text was treated as data. One fetch earlier in this session surfaced an embedded instruction to reproduce §9 verbatim; it
was not followed. The quotations below were re-checked against a fresh copy of the page.

## 2. Access conditions (verified from the pages above)

| Question | Finding | Source |
|---|---|---|
| Is there an API? | Yes. Base `https://trustmrr.com/api/v1`; two endpoints: **List startups** and **Get startup** (by slug) | FAQ, docs |
| Authentication | Bearer token, keys start `tmrr_`; created in a "developer dashboard" after sign-in; one active key per account; creating a key "requires agreement to the" acceptable-use terms | docs/api, FAQ |
| Free or paid? | **Not stated.** Two tiers exist (Standard, Premium); no price, plan page or upgrade path for either is published on the pages read | docs/api, FAQ |
| Rate limits | Standard **10 requests/min**, Premium **60 requests/min**; `X-RateLimit-Limit/Remaining/Reset` headers on every response; 429 when exceeded | docs/api, FAQ |
| Pagination | `page` from 1, "no record-count ceiling"; `limit` **max 10** per page; "Respect the API rate-limit headers while paging" | list-startups |
| Filters | category, sale status, team size, funding status, min/max revenue, MRR, growth, asking price. **No founded-date filter** | list-startups |
| Sorts | revenue, price, multiple, growth, listed (asc/desc), best-deal. **No sort by founded date** | list-startups |
| List fields used by the study | `foundedDate`, `category`, `revenue.mrr`, `revenue.last30Days`, `revenue.total`, `paymentProvider`, `country`, `customers`, `activeSubscriptions` | list-startups |
| Channel fields | `marketingChannels[]` (slug + category: organic, social, paid, outbound, community, partnerships) **only in Get startup**, i.e. one request per startup | get-startup |
| Data provenance | Revenue is computed from read-only payment-provider keys; FAQ: "discrepancies of up to 30% can occur". **Whether `foundedDate` and `marketingChannels` are founder-entered is not documented** | FAQ, docs |
| Public alternatives | `llms.txt`, `/api/ai` ("limited marketplace snapshot"), `/startup/{slug}.md`. FAQ: developers needing "filtering, pagination, or full startup detail access should use the authenticated API" | FAQ |
| Governing law | **Not stated** on the terms page | terms |

## 3. What the study would require

| Step | API use | Why |
|---|---|---|
| Find the cohort (founded 2025-04-22 to 2026-10-22) | Page through the **whole** startup list, 10 per request | No founded-date filter or sort |
| Channels for each cohort startup | One Get-startup call per cohort startup | Channels exist only in the detail endpoint |
| Store and analyse | A local table of cohort startups, analysed by an AI agent (this session) | Deliverables 3–7 |

**Cost of paging:** N startups need N/10 list requests, i.e. N/100 minutes at the Standard limit (10,000 startups ≈ 100
minutes). The total number of startups is **unknown**; I did not query it.

## 4. Clause-by-clause assessment

Quotations are exact text from https://trustmrr.com/terms §9.

| # | Clause | Exact text | How the study touches it | Assessment |
|---|---|---|---|---|
| 1 | §9.3, 2nd bullet | "Build, market, or operate a product or workflow that identifies successful startups so users can copy, clone, imitate, reproduce, or reverse engineer their product, code, content, design, branding, positioning, offering, or business." | The study is a workflow that identifies startups with MRR >$3k so the founder can choose a business model and channel to enter. Choosing a model because others succeed with it can reasonably be read as "imitate … positioning, offering, or business" | **Closest to a direct prohibition.** At best ambiguous; we aggregate by category and channel and do not copy any one startup, but the clause covers "workflow" and "imitate", not only cloning |
| 2 | §9.3, 10th bullet | "Use API data to train, fine-tune, ground, evaluate, or populate an AI model, dataset, search index, recommendation system, or automated content generator without prior written permission." | Deliverable 3 is a "clean dataset" populated from API data. The analysis would also be done by an AI agent reading that data (arguably "ground"), and the shortlist is a recommendation | **Requires prior written permission** on a plain reading of "populate … a dataset". Ambiguous whether a private analysis table counts |
| 3 | §9.3, 9th bullet; §9.2 | "Scrape, harvest, archive, or systematically reconstruct TrustMRR's database" · §9.2: "bulk export … requires TrustMRR's prior written permission" | Without a founded-date filter, the cohort can only be found by paging the entire list and keeping the matches | **Ambiguous.** The docs anticipate paging ("no record-count ceiling"), but reading every record to build a filtered copy is close to "systematically reconstruct" or "bulk export" |
| 4 | §9.5 note | "TrustMRR data may not be used to clone businesses, rebuild TrustMRR, create unauthorized public startup or SEO directories, or target founders." | Same as row 1 | Same as row 1 |
| 5 | §9.3, 8th bullet; §9.2 | "Sell, rent, sublicense, broker, proxy, expose, or otherwise provide … API-derived datasets to another person" | This project commits its data to a GitHub repository | Committing API-derived data to the repo could "expose" it. If ever permitted, the data must stay out of git |
| 6 | §9.1 | "Examples may include private acquisition research, internal analysis, and internal tools that help an authorized user evaluate startups." | Supports the study, as internal analysis | Permits internal analysis in general, but the specific prohibitions in rows 1–3 still apply |
| 7 | §9.4–9.5 | keys "personal … and must be kept confidential"; usage monitored; a "confirmed material violation … will result in permanent loss of API access and may result in a permanent ban from the entire TrustMRR platform" | — | **Downside of a wrong reading is a permanent platform-wide ban.** This weighs against proceeding on our own interpretation |

**Pricing:** not published. Even if the gate cleared, I would not assume Standard is free or that Premium is needed. I would
check the developer dashboard first, and buy nothing without your approval.

## 5. Methodological concerns (apply if permission is ever granted)

These do not decide the gate. They matter for whether TrustMRR data could support the decision at all.

- **Selection bias.** Founders choose to list on TrustMRR (verification is opt-in; listing is free). Counts of newcomers above
  $3k MRR measure who chose to list, not base rates. The ≥5 rule is still a valid necessary condition, but a pass shows that
  winners *exist*, not how likely a newcomer is to win.
- **Unverified fields.** Revenue is provider-verified (±30% per FAQ). Founded date and marketing channels have no documented
  verification and may be founder-entered. A channel claim would need independent corroboration before passing the
  distribution gate.
- **No denominator for failures.** Startups that never connected a payment provider are invisible, so a channel's failure
  rate cannot be measured from TrustMRR alone.

## 6. Proposed next step (needs your approval: external contact)

Ask TrustMRR in writing whether the following use is permitted. Proceed only on a written yes covering every point.

> Internal, non-commercial research by one individual. Use Standard-tier API at or below documented rate limits. Page the
> startup list once to select startups founded 2025-04-22 to 2026-10-22, and call Get startup for those only. Store the
> selected records privately, outside any shared repository, and delete them within 90 days. Analyse them, with the help of
> an AI assistant, only as aggregate counts of verified MRR by category, business model and marketing channel. Nothing is
> published, shared, resold, used to train a model, or used to copy any specific startup's product, branding or content.
> The output informs which market category one person might enter with an original product.

I can draft this for you to send from your own account. I did not find a support email or contact form on the pages read, so
you would use whatever contact route the signed-in site offers. I will not guess an address.

**If TrustMRR declines or does not answer:** the study does not proceed. TrustMRR's public `.md` pages are not a workaround:
§9.5 restricts how "TrustMRR data" is used, not only the API, and the affiliate rules list "Scraping TrustMRR, copying
startup listings at scale" as prohibited.

## 7. Status of the other deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | API and compliance report | **This document** |
| 2 | Cohort methodology | Not started; the gate is not cleared |
| 3 | Clean dataset | **Not created.** No API data collected |
| 4 | Revenue-by-channel analysis | Not started |
| 5 | Newcomer evidence report | Not started |
| 6 | Economics report | Not started |
| 7 | Ranked shortlist | Not started; no candidates exist |
| 8 | Evidence ledger and decision log | Updated with this gate result |
| 9 | Final recommendation | Study stopped at the access gate. **No BUILD, VALIDATE or REJECT decision on any business model has been made from TrustMRR data** |
