# Pre-build validation plan (2026-10-22)

**Principles:**
- Thresholds are fixed **before** results are seen.
- No outreach, ads, accounts, purchases or publishing without explicit approval.
- Waitlists, likes and free sign-ups never count as willingness to pay.

| ID | Candidate | Experiment | Cost | Time | Needs approval? | Phone-feasible? |
|---|---|---|---|---|---|---|
| E1 | Jira reports | Re-measure cohort ATL-JIRA-RPT at day 30/60/90 | $0 | ~5 min per run | No | Yes (ask Claude in a cloud session) |
| E2 | Jira reports | Publish one free Forge time-in-status app with a paid tier; read paid conversions from vendor reporting | $0 + build time | 8–12 weeks | **Yes** (KYC, account, publishing) | No |
| E3 | Document SaaS | SERP newcomer study: 40 transactional queries × top 10 → domain registration date (RDAP) + live paid plan? | $0 | 1 session | No | Yes |
| E4 | Document SaaS | AI-substitution test: 5 **synthetic** statements (generated, no real personal data) through a free general AI assistant; score transaction accuracy and balance reconciliation | $0 | 1 session | No | Yes |
| E5 | Document SaaS | Working free converter page with a clearly labelled paid tier via MoR; measure organic visitors → trials → payments | Domain ~$10–15/yr + MoR fees | 3–6 months | **Yes** | No |
| E6 | Apify lawful | Broader category scan (≥40 more lawful terms) looking for any category with ≥1,000 combined users/30d **and** a median primary price ≥$0.01/event | $0 | 1 session | No | Yes |
| E7 | Apify lawful | Re-measure cohort APIFY-NEW-17D at day 30/60 (persistence of early users) | $0 | ~10 min | No | Yes |

## Success, failure and stopping rules

**E1 — Jira newcomer traction** (independent-vendor apps, n=133):
- **Pass at day 60 (2026-12-20):** ≥15% at ≥25 installs **and** ≥3 at ≥100.
- **Fail:** median ≤3 **and** none at ≥100.
- **In between:** wait for day 90.
- **Evidence:** `cohort_snapshots.csv` deltas by product age.
- **Stop rule:** fail → drop the Jira reports lane.

**E2 — Jira willingness to pay** (only if E1 passes and eligibility is confirmed):
- **Pass:** ≥25 installs by week 8 **and** ≥3 paid licences within 8 weeks of enabling paid tiers.
- **Fail:** <25 installs at week 8, **or** 0 paid licences after 8 weeks of paid tiers.
- **Stop rule:** fail → stop; do not iterate features hoping to fix distribution.

**E3 — Search newcomers:**
- **Pass:** ≥20% of ranking domains registered within the last 3 years, **and** ≥3 of those young domains show a live paid plan.
- **Fail:** <10% young domains, **or** none of the young domains charges.
- **Stop rule:** fail → reject the document-SaaS lane for organic acquisition.

**E4 — AI substitution:**
- **The opportunity survives if** the free assistant gets <98% of transactions right **or** fails balance reconciliation on ≥2 of 5 statements.
- **Reject the lane if** it gets ≥99% right and reconciles all 5.
- **Limitation:** synthetic statements may be easier than real ones.

**E5 — Real demand** (only if E3 and E4 pass, with approval):
- **Pass at month 3:** ≥500 organic visitors/month **and** ≥5 paying customers.
- **Fail:** <150 visitors/month **or** 0 payments.
- **Stop rule:** fail → stop.

**E6/E7 — Apify:**
- **Keep as a side probe only if** E6 finds a qualifying category **and** E7 shows ≥10 sampled actors still >100 users at day 60.
- **Otherwise reject.**

**Programme stopping rule:**
- **Trigger:** E1 and E3 both fail, or E4 shows full AI substitution.
- **Response:** no build. VentureScout moves to unmeasured channels (HubSpot, monday.com, Zapier-led SaaS, Microsoft) using the same cohort method, or stops.

## Evidence to collect for each run

- Observation date.
- Product age at observation.
- Denominator.
- Metric definition.
- Raw file path.
- Any API anomaly (see the quarantined 2026-10-22 Atlassian rows).
