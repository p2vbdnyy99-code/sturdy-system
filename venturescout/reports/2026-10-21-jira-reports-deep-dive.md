# VentureScout — Jira Cloud Reports Deep Dive (2026-10-21)

## Decision: GATHER MORE EVIDENCE. Do not build.

Two things block investment, and both can be resolved at no cost:

1. **Seller eligibility for an India-based individual is only partly established.** Official Atlassian docs allow
   individual partner profiles and describe the KYC process. They do **not** state whether an Indian individual
   can be verified with PAN alone, paid to an Indian bank account, or exempted from 30% US withholding.
   A question asking exactly this, posted on Atlassian's developer forum on 2026-10-18, has no answer yet.
   → Ask Atlassian directly (§1.4).
2. **The newcomer-distribution evidence turned negative on closer inspection.** **152 Jira report-type apps
   launched in the last 90 days (from 105 vendors), and their median install count is 1.** Across the 40 niches,
   only **2 independent new vendors** have any app at ≥100 installs in a top-10 search result. The earlier
   "14% win rate for Reports" mostly reflects established vendors.
   → Track a fixed cohort of new apps for 60 days before deciding (§6).

If both clear, the best niche is **time-in-status / flow-time reporting**, followed by **SLA tracking for Jira
Software teams (not JSM)** and **scheduled exports and reports**. Confidence in every niche is **low**.

Registers used below: **[V]** verified from a primary source or our own API pull · **[S]** secondary or community source ·
**[H]** hypothesis/assumption · **[?]** missing evidence.

---

## 1. Seller eligibility (India-based individual)

### 1.1 What official Atlassian sources establish

| Requirement | Finding | Source (date) |
|---|---|---|
| Individual may be a partner | **Yes [V].** "If you're an individual developer without a parent company … create a partner profile using your name." | [Become a partner](https://developer.atlassian.com/platform/marketplace/become-a-partner/) (updated 2026-08-24) |
| Agreement party | "the individual or entity registering as a vendor or partner"; must be **≥18** and able to contract [V] | [Marketplace Partner Agreement](https://www.atlassian.com/licensing/marketplace/partneragreement) (revised 2025-12-01) |
| KYC before **any** app upload (free apps included) | "All Partners who want to upload an app … will be assigned this ticket." Individual: ID document (passport accepted), phone, email, **selfie via Stripe Identity**. Business: name, address, "registration number **and/or** tax identification number." [V] | [Partner due diligence](https://developer.atlassian.com/platform/marketplace/partner-due-diligence/) (updated 2026-04-21) |
| Private-domain email | Partner Portal access needs "a private domain email address"; public domains (e.g. gmail.com) are refused [V] | [Become a partner](https://developer.atlassian.com/platform/marketplace/become-a-partner/) |
| 2-step verification, security questionnaire | Required during partner registration [V] | [Register as a Marketplace partner](https://developer.atlassian.com/platform/marketplace/onboarding-hub/plan/register-as-an-atlassian-marketplace-partner/) (updated 2026-05-19) |
| Payouts | ~30 days after month-end, by EFT to "a valid bank account **in your name**"; held until **US$500** is due [V] | Partner Agreement §4.4 |
| Taxes | Atlassian may withhold taxes from payouts; the partner owes income tax on payouts; Atlassian handles end-customer sales tax [V] | Partner Agreement §4.7; [Sales tax](https://developer.atlassian.com/platform/marketplace/sales-tax/) |
| Sanctions | Must comply with US export and sanctions law; no country list published [V]. India is not, to my knowledge, a sanctioned country [register (b), not checked here] | Partner Agreement §8.5 |
| Revenue share | **0% on the first $1M lifetime Forge revenue** (Forge-only modules, Forge auth, Forge UI) from 2026-01-01; above that 16%, rising to 17%. Connect apps pay 20%, rising to 25% [V] | [Atlassian blog](https://www.atlassian.com/blog/developer/updates-to-marketplace-revenue-share-2026) (2025-05-05; dates later extended) |

### 1.2 What only community posts suggest [S]

- A sole trader (Portugal) reports **passing verification with a personal tax number** in both the registration-number
  and tax-ID fields and answering "yes" to a sole-proprietor question. No registration certificate was requested.
  He reports submitting **W-8BEN** through the support ticket and that **30% default US withholding** applies without it
  ([thread, 2026-09-01](https://community.developer.atlassian.com/t/individual-developer-no-registered-company-whats-the-minimum-verification-needed-to-publish-a-paid-via-atlassian-app/102404)).
  He says Atlassian treats app sales as **business profits (treaty Art. 7)**, but Atlassian staff told him a US TIN is needed for exemption, which he disputes.
- An Atlassian staff reply says KYC plus W-8BEN are needed for payouts, and a sole-proprietor custom domain is fine
  ([Canada thread](https://community.developer.atlassian.com/t/is-canada-a-supported-payout-country-for-marketplace-partners/103113)).
- **India specifically: unanswered.** "Can an individual in India (no company) become a paid-app Marketplace partner?",
  posted 2026-10-18, has **no replies**
  ([thread](https://community.developer.atlassian.com/t/can-an-individual-in-india-no-company-become-a-paid-app-marketplace-partner/103332)).

### 1.3 Indian identifiers: what each is for (none is interchangeable)

| Item | What it is | Needed for Atlassian? | Needed under Indian law? |
|---|---|---|---|
| **PAN** | Income-tax ID for individuals | Likely the "tax ID" an individual enters [S]; **unconfirmed** for India | You need it to file income tax on payouts [register (b)] |
| **GST registration (GSTIN)** | Indirect-tax registration | Not mentioned anywhere by Atlassian [V absence] | Notification 10/2017-Integrated Tax exempts **inter-state service suppliers below ₹20 lakh/yr** (₹10 lakh in some special-category states) from registration ([text](https://taxheal.com/notification-no-102017-integrated-tax.html), secondary copy). **Whether Marketplace payouts count as "export of services" (zero-rated) and how they count toward the threshold needs a CA [?]** |
| **Udyam** | Voluntary MSME registration for scheme benefits | Not mentioned by Atlassian | **Not mandatory** per secondary sources ([Razorpay](https://razorpay.com/learn/what-is-udyam-registration/)); free, self-declared |
| **Incorporation** (LLP/Pvt Ltd) | Separate legal entity | **Not required**: individual profiles allowed [V] | Not required to run a sole proprietorship |
| **W-8BEN** | US form certifying foreign status / treaty claim | Needed to avoid **30%** US withholding [S] | — (US form). PAN on line 6a as foreign TIN is reportedly accepted elsewhere [S]; [IRS instructions](https://www.irs.gov/pub/irs-pdf/iw8ben.pdf) |
| **Bank account in your name** + inward remittance | Payout destination | Required [V]; **Indian accounts not confirmed** [?] | Banks issue a remittance certificate (FIRC/e-BRC); purpose-code and documentation: ask your bank/CA [?] |

### 1.4 Questions only Atlassian can answer (ask before investing further)

Raise them via the Marketplace support desk linked from
[Collaborating with Atlassian support](https://developer.atlassian.com/platform/marketplace/collaborating-with-atlassian-support/).
That is a support request, not sales outreach.

1. Can an **individual resident in India** with **no registered business** complete partner due diligence using **PAN** as the tax ID?
2. Are **Paid-via-Atlassian payouts to an Indian bank account** (USD, SWIFT/EFT) supported?
3. Will Atlassian accept a **W-8BEN with PAN on line 6a**, claiming **India–US treaty Art. 7 business profits** for 0% withholding, or does it require a US TIN/ITIN?
4. Is a **GSTIN** required anywhere in Atlassian's process?
5. Can a partner profile and its apps later be **transferred to a company** if you incorporate?

**Also ask a Chartered Accountant (CA):** GST treatment of the payouts (export of services? LUT?), the income-tax
regime for this income, and bank remittance documentation.

---

## 2. Forge costs, limits and feasibility

**Pricing [V]** ([Forge platform pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/), updated 2026-08-12):
billed to the developer from 2026-01-01; **free allowances are per app, per month**; free and paid apps are treated the same.

| Capability | Free / month | Overage |
|---|---|---|
| Functions | 200,000 GB-s | $0.000025 / GB-s |
| KVS reads / writes | 0.1 GB / 0.1 GB | $0.055 / $1.090 per GB |
| SQL compute / requests / storage | 1 hr / 100k / 730 GB-h | $0.143/hr, $1.929/M, $0.0007685/GB-h |
| Logs | 1 GB | $1.005 / GB |

**Limits [V]** ([invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/), updated 2026-09-01;
[scheduled triggers](https://developer.atlassian.com/platform/forge/limits-scheduled-trigger/)):
- Sync functions get 25 s; async functions and scheduled jobs up to 900 s.
- Memory is 512 MB by default (1 GB max).
- Up to 5 scheduled triggers per app, of which 1 may run every five minutes.
- Requests to Jira are capped at 100k/min per app per tenant.

**Cost scenarios [H]** (`models/income_model.py`; assumes 2–5 s per report render at 512 MB plus one nightly history snapshot per site):

| Scenario | ≈ GB-s / month | ≈ Forge bill |
|---|---|---|
| 50 sites, light use | 0.06M | **$0** |
| 300 sites, base use | 0.9M | **~$20** |
| 300 sites, heavy use | 7.1M | **~$180** |
| 3,000 installs of a free "wedge" app | 5.7M | **~$160** |
| 3,000 installs, heavy | 45M | **~$1,200** |

**Implication:** costs are trivial for a small paid base. **Free users are not free:** a popular free wedge app with heavy
usage can cost hundreds per month. The biggest unknown is real render duration for changelog-heavy reports such as time-in-status.

**Feasibility [register (b) unless noted]:**
- Forge supports Jira dashboard-gadget and project-page modules and Jira REST access including issue changelogs, so read-only reporting is technically routine.
- Apps with no data egress can earn the **"Runs on Atlassian"** badge [V] ([docs](https://developer.atlassian.com/platform/forge/runs-on-atlassian/)).
  That reduces security-review friction with customers.
- **Scheduled e-mail reports** would probably need an external mail service (egress), which costs the badge [?].

---

## 3. The 40 Jira report use cases

Method: `scanners/jira_niche_scan.py` takes the top 10 Marketplace search results per term (Jira Cloud, relevance order).
For each app it records installs, ratings, live Cloud pricing, first release date, the vendor's first-ever release, and
1–3★ reviews since 2024-10-21. "New" means first released on or after 2025-04-21. An "independent new vendor" is one
whose first-ever app dates from 2024-10-21 or later. Native column: **V** = Jira has the report ([Jira Cloud reports list](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-cumulative-flow-diagram/));
**P** = partly covered; **J** = JSM only; **E** = Atlassian Analytics, included with Enterprise ([Atlassian](https://www.atlassian.com/blog/company-news/analytics-general-availability)); **?** = not verified.

| # | Use case (search term) | Leader installs | Paid apps in top 10 (with $0 ≤10-user tier) | Median 100-user $/yr | New apps in top 10 | New ≥100 installs | …from independent new vendors | Recent ≤3★ reviews | Native in Jira? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | issue aging report | 10,725 | 9 (5) | 1650 | 2 | 2 | 1 | 19 | ? |
| 2 | stale issues | 5,604 | 9 (8) | 750 | 1 | 0 | 0 | 18 | ? |
| 3 | cycle time | 26,318 | 9 (8) | 900 | 1 | 0 | 0 | 33 | V (control chart; team-managed cycle time report) |
| 4 | lead time | 26,318 | 9 (8) | 900 | 1 | 0 | 0 | 33 | P (control chart) |
| 5 | work in progress WIP | 3,031 | 10 (8) | 900 | 2 | 1 | 0 | 8 | P (CFD) |
| 6 | sprint predictability | 2,298 | 10 (9) | 500 | 1 | 0 | 0 | 0 | P (velocity, sprint report) |
| 7 | blocked issues | 5,604 | 9 (8) | 790 | 0 | 0 | 0 | 18 | ? |
| 8 | reopened issues | 5,604 | 9 (7) | 750 | 0 | 0 | 0 | 18 | ? |
| 9 | SLA jira software | 3,378 | 9 (8) | 900 | 3 | 2 | 0 | 6 | J (SLAs native in JSM only) |
| 10 | release readiness | 1,689 | 9 (7) | 700 | 1 | 0 | 0 | 7 | P (version, release burndown) |
| 11 | cross project report | 10,725 | 9 (6) | 1040 | 0 | 0 | 0 | 17 | E/? |
| 12 | management report | 10,725 | 9 (7) | 1250 | 0 | 0 | 0 | 20 | E/? |
| 13 | engineering metrics DORA | 3,586 | 9 (6) | 850 | 2 | 1 | 1 | 2 | P (deployment frequency) |
| 14 | team capacity | 9,364 | 10 (6) | 1325 | 0 | 0 | 0 | 19 | ? |
| 15 | custom dashboard | 11,647 | 9 (7) | 1090 | 0 | 0 | 0 | 20 | V (dashboards) |
| 16 | scheduled report email | 10,725 | 9 (6) | 2000 | 0 | 0 | 0 | 20 | ? |
| 17 | historical trend report | 10,725 | 9 (7) | 1000 | 1 | 0 | 0 | 17 | E/? |
| 18 | time in status | 10,545 | 8 (8) | 1025 | 0 | 0 | 0 | 11 | ? |
| 19 | worklog report | 10,725 | 9 (5) | 1200 | 0 | 0 | 0 | 15 | ? |
| 20 | burnup burndown | 3,586 | 10 (9) | 765 | 4 | 1 | 0 | 2 | V |
| 21 | velocity chart | 10,725 | 9 (6) | 750 | 2 | 0 | 0 | 11 | V |
| 22 | cumulative flow diagram | 8,492 | 9 (6) | 550 | 5 | 2 | 1 | 3 | V |
| 23 | throughput | 3,586 | 9 (8) | 750 | 8 | 2 | 0 | 1 | ? |
| 24 | monte carlo forecast | 1,426 | 8 (5) | 900 | 3 | 1 | 0 | 1 | ? |
| 25 | sprint report | 10,725 | 9 (5) | 1000 | 1 | 0 | 0 | 12 | V |
| 26 | epic progress report | 11,602 | 10 (7) | 1115 | 0 | 0 | 0 | 17 | V (epic report) |
| 27 | portfolio report | 12,691 | 9 (6) | 3000 | 0 | 0 | 0 | 23 | E/? |
| 28 | created vs resolved | 2,449 | 9 (8) | 550 | 3 | 1 | 0 | 2 | ? |
| 29 | resolution time | 26,318 | 9 (8) | 900 | 0 | 0 | 0 | 33 | ? |
| 30 | workload assignee | 214 | 8 (6) | 200 | 4 | 0 | 0 | 1 | ? |
| 31 | bug trend defect metrics | 3,586 | 8 (4) | 1000 | 1 | 1 | 1 | 4 | ? |
| 32 | story points report | 10,725 | 10 (8) | 875 | 0 | 0 | 0 | 18 | P (velocity) |
| 33 | export excel report | 10,725 | 10 (8) | 2695 | 0 | 0 | 0 | 15 | P (CSV export) |
| 34 | pivot table | 7,827 | 9 (6) | 870 | 2 | 0 | 0 | 12 | ? |
| 35 | issue history status changes | 10,545 | 8 (7) | 1125 | 1 | 1 | 1 | 13 | P (issue history) |
| 36 | flow efficiency | 873 | 9 (6) | 860 | 4 | 2 | 1 | 1 | ? |
| 37 | KPI dashboard | 10,725 | 9 (7) | 1380 | 1 | 1 | 0 | 20 | V (dashboards) |
| 38 | sprint scope change | 2,298 | 10 (9) | 500 | 3 | 0 | 0 | 0 | P (sprint report) |
| 39 | overdue due date issues | 5,604 | 9 (8) | 450 | 1 | 0 | 0 | 17 | ? |
| 40 | dependency report | 10,725 | 9 (7) | 1430 | 0 | 0 | 0 | 17 | ? |

**Market-wide pricing facts [V]** (206 distinct apps in these results):
- **185 are paid**, and **148 of those (80%) charge $0 for 1–10 users**.
- 100-user annual price: p25 **$500**, median **$790**, p75 **$1,400**.

**Limitations:**
- Marketplace text search is loose. Some terms (e.g. "cycle time" → Tempo Timesheets) return off-topic leaders, and review counts include off-topic apps.
- Some "new" first-release dates are **re-listings** of old products, e.g. Xporter and Email This Issue on 2025-02-14. The independent-vendor column screens these out.
- The API's relevance order may differ from what the in-product search shows.
- Native gadget coverage (created vs resolved, average age, etc.) was **not verified**: the Atlassian gadget page returned 404.

---

## 4. Ranked shortlist (all low confidence)

| Rank | Niche | Why it ranks | What argues against it |
|---|---|---|---|
| **1** | **Time-in-status / flow time / issue aging** | Highest paid demand: SaaSJet 5,202, Timepiece 4,346, Bloompeak 10,545 free + 1,335 paid; 100-user prices **$500–$2,260**. Only niche with an **independent newcomer win at a high price**: TypeSwitch "Flow Time Report" (vendor started 2025-03; 244 installs; **$1,650/yr for 100 users**). Recurring complaints are confusing units and slow gadget loads. Native coverage is partial (control chart / cycle-time report). | Crowded (10+ apps). Broken Build entered in 2025 on an existing brand. Differentiation unproven. Changelog-heavy compute. |
| **2** | **SLA tracking for Jira Software teams (not JSM)** | Native SLAs exist **only in JSM** [register (b)], a structural gap. 9 paid apps; leader Time to SLA has 3,378 installs at $1,820/yr for 100 users. Complaints: "No UI for reports"; custom-field configuration issues. | Smaller demand. **0 independent newcomer wins.** Overlaps with JSM upsell. |
| **3** | **Exports and scheduled reports** (Excel/PDF/email) | Highest prices (median **$2,000–$2,695**/yr at 100 users). Loud 2025–26 complaints about leaders: Xporter "doesn't work", scheduler limits, 1,500-issue export cap. | **0 newcomer wins**; dominated by Midori, Xblend and Appfire. Scheduled email likely needs egress (loses the badge). Larger build. |

**Rejected:**
- Agile flow charts (CFD, throughput, Monte Carlo, burnup, velocity): 4+ copycat vendors (Clearlane, Toine.com, StonikByte, 9ByNight) launched Sep–Oct 2026 with 0–26 installs, and the charts are largely native.
- Sprint scope change: native sprint report covers it; 3 new apps at 1–3 installs.
- Workload: weak demand signal (leader 214 installs).
- Portfolio, capacity and BI: heavyweight incumbents (Tempo, eazyBI).

---

## 5. Newcomer distribution and conversion

### 5.1 The "14% for Reports" finding, re-tested [V, our data]

| Segment (new = first release ≥ 2025-04-21) | New apps | ≥100 installs | From independent new vendors only |
|---|---|---|---|
| All Jira + Confluence Cloud | 2,736 | 93 (3.4%) | 1,918 → **37 (1.9%)** |
| Reports category | 79 | 11 (13.9%) | 45 → **5 (11.1%)** |
| Dashboard gadgets | 24 | 3 | 10 → 1 |
| Time tracking | 37 | 5 | 25 → 4 |
| Charts & diagramming | 43 | 4 | 19 → **0** |

**Limitations:**
- Category tags cover only 454 of the 2,736 new apps; uncategorised apps win at 2.6%.
- Sample sizes are tiny (5 of 45).
- Some "independent" winners are **established companies new to the Marketplace**: Cursor, GitHub, Harvest, Pylon, Salto, Flagsmith. Their installs come from existing brands, not Marketplace discovery.
- Real marketplace-driven newcomers among the 37 include Agile Pulse (free planning-poker wedge, then paid siblings), Terano Apps (6 small utilities at 172–221 installs each), TypeSwitch and OptimalSDLC.
- **Conclusion:** Marketplace discovery works for independents **occasionally**, mostly through portfolios or free wedges, over 12–20 months.

**Latest cohort (launched 2026-07-23 → 2026-10-21) [V]:**
- 152 Jira report-type apps from 105 vendors; **median 1 install**; 11 apps at ≥10 installs; 3 at ≥50.
- Among the 133 from independent new vendors: 6 at ≥10, 2 at ≥50, **0 at ≥100**.
- Baseline saved in `data/cohort_snapshots.csv`.

### 5.2 Can installs tell us about paying customers? **No.**

- **80%** of paid report apps give **1–10-user sites the app free**, so installs include free sites.
- Installs also count active evaluations [S] ([Appfire docs](https://appfire.atlassian.net/wiki/x/f4K4C)).
- Cloud trials **auto-convert** to paid unless cancelled [S] ([Atlassian cloud conversions](https://developer.atlassian.com/platform/marketplace/cloud-conversions)).
- **No public free-to-paid or install-to-paid rate exists.**
  - The 2021 "benchmark" thread contains no numbers ([thread](https://community.developer.atlassian.com/t/benchmark-for-cloud-conversion-rate-for-marketplace-apps/46694)).
  - A 2026-10-03 thread asking for the "share of paid licenses among active installs" has no replies ([thread](https://community.developer.atlassian.com/t/share-of-paid-licenses-among-active-installs-for-paid-cloud-apps/103089)).
  - Only a vendor's own reporting (MPAC) shows it.
- **Only public proxy [V]:** 19 vendors list separate free and paid editions of the same app. Installs of the paid listing ÷ installs of the free listing range from **0.03 to 3.6**, median **0.40**.
  Because paid-listing installs also include free ≤10-user sites and trials, this is **not a conversion rate**. It is too dispersed to anchor anything.

---

## 6. Income model (`models/income_model.py`)

**Assumptions [H]:**
- Forge 0% revenue share.
- 1% FX and bank cost.
- $100/mo fixed costs.
- $50/mo Forge.
- **Effective tax 15/25/35% are placeholders, not your rate.**

Price points are observed Marketplace prices per paying site per year (100-user tier p25 $500, median $790).

| $/site/yr | Take-home | Tax | Gross / month | ARR | **Paying sites** | New sites/mo to offset 2%/mo churn [H] |
|---|---|---|---|---|---|---|
| 150 | $8k–$10k | 25% | $10.9k–$13.6k | $131k–$163k | **874–1,090** | 17–22 |
| 300 | $8k–$10k | 25% | same | same | **437–545** | 9–11 |
| 550 | $8k–$10k | 25% | same | same | **238–297** | 5–6 |
| 840 | $8k–$10k | 25% | same | same | **156–195** | 3–4 |
| any | — | 15% → 35% | $9.7k → $15.7k | | about −12% to +15% vs the 25% row | |

**Sensitivity only: installs needed if a share *r* of installs pays.** These are hypotheses, not measured rates.

| $/site/yr | r = 2% | r = 5% | r = 10% | r = 20% |
|---|---|---|---|---|
| 150 | 43.7k–54.5k | 17.5k–21.8k | 8.7k–10.9k | 4.4k–5.4k |
| 550 | 11.9k–14.9k | 4.8k–5.9k | 2.4k–3.0k | 1.2k–1.5k |
| 840 | 7.8k–9.7k | 3.1k–3.9k | 1.6k–1.9k | 0.8k–1.0k |

**Reality check:** the best-performing *independent* report app found (TypeSwitch, 244 installs after ~17 months) would
need roughly 10× its current install count even at r = 10% and $550.

Cash flow also depends on:
- annual vs monthly billing (annual brings lumpy cash);
- refunds;
- the $500 payout threshold;
- the 30-day payout lag;
- US withholding if W-8BEN is not accepted;
- churn;
- the 17% revenue share after $1M lifetime revenue.

---

## 7. Google Workspace alternative: same newcomer standard

- **Newcomer test cannot be run from public data [V]:** Workspace Marketplace listings show install bands (e.g. "4K+") and
  "Listing updated" dates, but **no launch dates and no "newest" sort** ([example listing](https://workspace.google.com/marketplace/app/jira_reporting_in_sheets/213602572639)).
  Recent-entrant traction is therefore **unobservable without repeated snapshots**.
- The Jira-related search shows many small listings (Sheet Sync for Jira: 3; EasyJIRA: 115; Asset Sync: 4), but their ages are unknown.
- **Operational burden is higher for an India-based individual:**
  - Google does not appear to bill for third-party apps. Its 2021 post lists Free/Paid options but not who collects payment ([Google blog](https://developers.googleblog.com/2021/10/app-pricing-update-details-and-editors.html)) [?]. You would likely need your own payment processor, sales-tax handling and payouts.
  - Restricted scopes (Drive, Gmail) trigger a **CASA security assessment**, renewed annually. Reported costs range from free to $3k–$6k at third-party labs [S] ([freeCodeCamp](https://www.freecodecamp.org/news/tier-casa-security-assessment/)).
- **Recommendation:** Atlassian stays ahead *operationally*, because Atlassian bills customers, remits sales tax and pays out.
  On *distribution* evidence, neither marketplace is proven. No other marketplace was assessed in this session.

---

## 8. Cheapest decisive validation experiment

**Experiment A: "shadow cohort" (zero cost, zero code, no outreach, runs from the phone by asking Claude).**

- **What:** re-measure installs for the fixed cohort of 152 Jira report apps launched 2026-07-23 → 2026-10-21, using
  `scanners/cohort_tracker.py`, on days 30, 60 and 90 (≈ 2026-11-20, 2026-12-20, 2027-01-19).
  These vendors are running the experiment we would run, for free.
- **Measures:** whether *independent new vendors* gain installs through Marketplace discovery right now, in this category.
- **Success at day 60:** ≥15% of the 133 independent-vendor apps have ≥25 installs, **and** ≥3 have ≥100.
- **Failure at day 60:** median still ≤3 and none ≥100 → **reject the Atlassian reports lane.**
- **In between:** extend to day 90 before deciding.
- **Limitation:** it tests discoverability, **not willingness to pay**. Installs ≠ paying customers.

**Experiment B (only if A passes and eligibility is confirmed): one small free Forge app as a probe.**

- **What:** a single, genuinely useful time-in-status gadget, clearly free, with no "coming soon" claims.
- **Measures:**
  - installs per week from Marketplace search (MPAC reports show this to the vendor);
  - a paid sibling or paid tier added at week 6;
  - MPAC **paid conversions** — the first real willingness-to-pay data.
- **Cost:** about $0 (Forge free tier).
- **Kill criteria:** <25 installs after 8 weeks, or <3 paid conversions within 8 weeks of adding the paid tier.

Not counted as evidence: likes, community upvotes, waitlists, or install counts on their own.

---

## 9. Execution report

- **A. Learned:**
  - Individuals can be Atlassian partners, but India-specific verification and payout rules are unconfirmed.
  - Forge costs are negligible at small scale.
  - Report niches are flooded: median 1 install among 152 recent apps.
  - No public paid-conversion data exists.
- **B. Best niche:** time-in-status / flow-time reporting (low confidence).
- **C. Evidence vs assumptions:** see the [V]/[S]/[H]/[?] tags throughout.
  The paid-conversion rate, tax rate and India payout support are the critical unknowns.
- **D. Economics:** 156–1,090 paying sites depending on price ($840 → $150), at a placeholder 25% tax.
- **E. Distribution:** Marketplace search plus in-product "Explore apps". Self-service trial, Atlassian billing. Newcomer reachability unproven.
- **F. Next three actions:**
  1. Get Atlassian's written answers to §1.4.
  2. Run Experiment A at day 30/60/90.
  3. Get a CA consult on GST/income tax/remittance (only if 1 and 2 pass).
- **G. Your immediate action:** submit the §1.4 questions to Atlassian Marketplace support (from your phone).
- **H. Avoid:**
  - building any app;
  - buying a domain until eligibility is confirmed;
  - agile-chart niches (CFD/throughput/burnup);
  - treating installs as customers.
- **I. Decision:** **Gather more evidence.**
