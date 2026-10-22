# Venture decision (2026-10-22)

## Decision: **RESEARCH FURTHER**

No candidate is strong enough for **VALIDATE** in the sense of "a promising opportunity exists". All three leaders lack
evidence on at least one of the four required conditions. **BUILD** is not justified.

| Candidate | Score | Gates | Status |
|---|---|---|---|
| Paid Jira Cloud reporting app | 56 | Pass | Leading, unproven newcomer distribution and paid conversion |
| Search-led document→spreadsheet SaaS | 50 | Pass | Paid demand verified; newcomer search traction and AI-substitution risk untested |
| Lawful Apify pay-per-event utilities | 50 | G3 weak | **Rejected as an income engine**: fails the economics |
| Apify third-party-platform scrapers | — | **G2 fail** | Rejected |
| Another browser extension | — | Founder evidence | Excluded |

## The ten questions

**1. Strongest candidate and why?**
A paid Jira Cloud reporting app (time-in-status/flow).
- It is the only candidate where **spending on the category, platform billing and organic discovery are all verified at once**:
  - >$2B ecosystem sales (A7);
  - 185 of 206 report apps are paid, median $790/yr for 100 users (C1);
  - Atlassian handles trials, billing and tax, with 0% fee on the first $1M (A4).
- Its lead (56 vs 50) is **inconclusive** given the evidence gaps.

**2. Evidence that unknown newcomers can gain customers there?**
Weak:
- Independent apps launched in April 2026: 12.1% reached ≥10 installs, 0.6% reached ≥100 (B2).
- In the 90-day report cohort, the median is 1 install (B4).
- Positive exceptions exist: TypeSwitch (244 installs at $1,650/yr in ~17 months, C3) and Agile Pulse (free app first, then paid apps at 500–676 installs).
- Installs are not paying customers.

**3. Evidence customers pay for the problem?**
- Published paid tiers from many vendors, with thousands of installs each (C1).
- Ecosystem-wide sales (A7).
- **Per-app revenue and paid share are not public** (C2).

**4. What remains unverified?**
- The install-to-paid ratio.
- Whether newcomer installs grow by day 60/90.
- Payout support for the founder's jurisdiction (A3).
- Whether Atlassian ships the feature natively.
- For document SaaS: newcomer search traction, conversion, and AI substitution.

**5. Realistic financial model for $8k–$10k take-home?** (illustrative 25% tax)
- $10.7k–$13.3k pre-tax per month, which means **156–194 paying sites at $840/yr**, **238–297 at $550**, or **442–550 at $300**.
- At a hypothetical 10% of installs paying, that is ~1.6k–5.5k installs.
- The best independent newcomer observed has 244. The target needs roughly **6–23×** today's best independent newcomer outcome, so it is not supported yet.

**6. Why might it fail?**
- Marketplace discovery doesn't surface a new vendor.
- Free 10-user tiers dilute paying share.
- Strong incumbents.
- Atlassian native features or AI (Rovo).
- Platform dependency.
- Payout or eligibility friction.

**7. Cheapest experiment that could invalidate it?**
- E1: the day-60 cohort re-measurement on 2026-12-20. It costs $0 and needs no code.
- For document SaaS, E3 and E4 are $0 desk tests that can invalidate it this week.

**8. What result would justify building?**
- E1 passes (≥15% of independents at ≥25 installs and ≥3 at ≥100 by day 60), eligibility is confirmed,
- **and** E2 later shows ≥3 paid licences within 8 weeks.
- For document SaaS: E3 and E4 pass, then E5 reaches ≥5 paying customers from organic traffic within 3 months.

**9. What result would make us abandon it?**
- **Jira:** day-60 median ≤3 with none at ≥100.
- **Document SaaS:** E3 finds <10% young domains, or E4 shows a free AI assistant does the job (≥99% accuracy and full reconciliation).

**10. What to do next, avoiding outbound sales and possibly only on an iPhone/iPad?**
Nothing requires a computer yet:
- E1, E3, E4, E6 and E7 are desk research I can run in a cloud Claude Code session, which you can trigger from the phone.
- No accounts, spending or publishing are needed until a pass result.

## Recommended next action

**Approve the two free document-SaaS desk tests (E3 search-newcomer study and E4 AI-substitution test with synthetic
statements).** They can confirm or eliminate the second candidate within one session, while the Jira cohort ages to its
day-30 check on 2026-11-20.

---

## Addendum 2026-10-22: document-to-spreadsheet SaaS tested

- **Test A** (search discoverability): **inconclusive**.
- **Test B** (AI substitution): **strong substitution warning, provisional** (the model tested was not a free consumer tier).
- **Candidate decision: REJECT.** See `document-saas-decision.md`. The only cheap result that could reopen it is a free-tool
  replication on 5 synthetic statements.
- **Portfolio decision: unchanged, RESEARCH FURTHER.**
  - The Jira cohort continues (day-30 re-measure on 2026-11-20).
  - Jira is **not** promoted to winner because the other candidate failed.

---

## Addendum 2026-10-22 (2): document-to-spreadsheet investigation closed

- **The generic converter remains REJECTED. The investigation is closed.**
- Two independent top-tier model runs achieved 200/200 exact transactions on 5 synthetic statements, with no missing or
  duplicated rows and all five reconciling.
- Limits: synthetic documents and top-tier models only.
- The free-tool experiment was **not run**. It is optional and does not block the next phase. A free-tool failure would not
  establish demand, willingness to pay or distribution.
- Do not reopen without genuinely new commercial evidence. See the Closure section of `document-saas-decision.md`.

## Addendum 2026-10-22 (3): TrustMRR newcomer study stopped at the access gate

- **Gate NOT CLEARED.** TrustMRR's API terms (updated 2026-10-09) prohibit, or are materially ambiguous about:
  - workflows that identify successful startups so users can "imitate" their business (§9.3);
  - populating a dataset with API data without prior written permission (§9.3);
  - "systematically reconstruct[ing]" the database (§9.3). There is no founded-date filter, so the cohort needs a full-list page.
- API pricing is not published.
- **Done:** no key was requested, no data was collected and the threshold is unchanged. See `trustmrr-api-compliance.md`.
- **Next:** with your approval, ask TrustMRR for written permission for the narrowly described internal use.
- **Portfolio decision: unchanged, RESEARCH FURTHER.** The Jira cohort continues (day-30 re-measure on 2026-11-20).

## Addendum 2026-10-22 (4): alternative-source investigation

- **Result: INSUFFICIENT EVIDENCE.** No free, terms-compliant source shows all of the following for the same business:
  - verified revenue above $3k a month;
  - a 2025+ launch date;
  - a channel we can check ourselves.
- **The threshold is unchanged.** See `alternative-source-assessment.md`.
- **Open decisions:**
  1. Whether to accept one-off platform-counted sales (Option 2) for marketplaces such as Envato.
  2. Whether to send the TrustMRR permission request, since the alternatives proved inadequate.
- **Portfolio decision: unchanged, RESEARCH FURTHER.**

## Addendum 2026-10-22 (5): founder decisions after the source assessment

**Interpretation:**
- The result is an **evidence bottleneck, not proof that the business models are bad.**
- The absence of five qualifying examples in the sources examined does not prove that no such path exists.
- Five successes would show that a path is possible, not the founder's probability of success.

**Decisions:**
1. **Threshold: strict MRR, unchanged.**
   - At least 5 qualifying newcomers per business-model/acquisition-channel combination.
   - Each with independently verified MRR strictly above $3,000.
   - Each launched between 2025-04-22 and 2026-10-22.
   - Distribution evidence must be independently checkable; founder claims alone do not qualify.
   - One-off sales are supplementary evidence only.
2. **TrustMRR: request narrowly scoped written permission, but the research does not depend on it.**
   - No API access or collection until a written reply explicitly covers the intended use, including dataset storage and
     AI-assisted analysis.
   - Draft: `trustmrr-permission-request.md`.
3. **No Product Hunt account** for this study.
4. **Jira cohort check on 2026-11-20 is kept** as a research milestone, not a commitment to build.

**Two tests per business model.** A model advances only when both have credible evidence:

| Test | Question |
|---|---|
| Market viability | Are customers paying for this kind of product? |
| Acquisition viability | Can a new, independent seller reach those customers through a channel that fits the constraints? |

**No product build.** The threshold is not lowered, founder claims are not accepted as proof, and a niche is not chosen because
its marketplace is large.

**Repository visibility (found 2026-10-22):**
- `p2vbdnyy99-code/sturdy-system` is **public** (GitHub API `"visibility": "public"`), not private.
- No TrustMRR API data may be committed to it while it is public.
- The permission request therefore asks only for private storage outside any shared or public repository.
