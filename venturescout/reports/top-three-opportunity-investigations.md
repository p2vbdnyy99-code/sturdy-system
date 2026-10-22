# Top-three opportunity investigations (2026-10-22)

Evidence IDs refer to `evidence-ledger.md`. Financial figures come from `models/scenarios.py`.
Every scenario uses an **illustrative 25% effective tax rate**. Pre-tax profit needed: **$10,667–$13,333/month**.

---

## 1. Paid Jira Cloud reporting app: time-in-status / flow-time reports (56/100)

**Competitors and pricing (live API, 2026-10-21; C1):**
- SaaSJet Time in Status: 5,202 installs, $1,150/yr for 100 users.
- OBSS Timepiece: 4,346 installs, $1,200/yr.
- Bloompeak: 10,545 installs on its free edition; 1,335 on its paid edition at $900/yr.
- Appfire JXL: 4,707 installs, $2,260/yr.
- Broken Build: 1,003 installs, $700/yr. An established vendor (first app 2014) launching a new app.
- TypeSwitch Flow Time Report: 244 installs, $1,650/yr. **The only independent newcomer at a high price** (vendor started 2025-03; C3).
- Most give the app free to sites with ≤10 users. Installs therefore overstate payers.

**Unmet needs (recent ≤3★ reviews):** confusing time units; slow gadget loading; filtering by issue type. These are **isolated complaints, not proof of broad demand.**

**Native/AI risk:**
- Jira natively offers a control chart and a team-managed cycle-time report (V).
- Atlassian Analytics comes with the Enterprise plan.
- If Atlassian ships time-in-status natively, the category shrinks.
- What survives an AI feature: trusted, auditable numbers computed from changelog history, plus dashboard gadgets that live inside Jira.

**Newcomer traction:** independents launched April 2026 show 12.1% at ≥10 and 0.6% at ≥100 installs (B2). The 90-day report cohort has a median of 1 (B4).

**Acquisition:**
- Marketplace keyword search and in-product discovery.
- Free 30-day trial that rolls into billing automatically.
- No outreach.

**Seller eligibility:** individuals allowed (A1). KYC (A2). Payout country support not listed (A3). W-8BEN for non-US partners (A6, S).

**Operating costs:** Forge $0–$180/month at 50–300 sites (A5 + model). A domain and email on that domain are required for Partner Portal access.

**Automation:**
- Fully automated: billing, licensing, trials, delivery (Atlassian), hosting (Forge).
- Manual: support desk (required), Jira API changes, security questionnaires.

**Financial scenarios:**

| Scenario | Price per site/yr | Paying sites | ARR | Installs needed if r of installs pay (hypotheses) |
|---|---|---|---|---|
| Conservative | $300 | 442–550 | $133k–$165k | r=5%: 8.8k–11k · 10%: 4.4k–5.5k |
| Base | $550 | 238–297 | $131k–$163k | r=5%: 4.8k–5.9k · 10%: 2.4k–3.0k |
| Optimistic | $840 | 156–194 | $131k–$163k | r=10%: 1.6k–1.9k · 20%: 0.8k–1.0k |

**Reality check:** the best independent newcomer found has 244 installs after ~17 months.

**Evidence needed to make a scenario credible:**
1. Our own install-to-paid ratio (vendor reporting).
2. Growth of independent cohort apps by day 60/90.

---

## 2. Search-led document-to-spreadsheet micro-SaaS (50/100)

**Problem:** bookkeepers and small businesses convert bank/card statements and invoices (PDF) into CSV/Excel for accounting imports.

**Competitors and pricing:**
- DocuClipper: $20.30–$279.30/mo on annual billing, 14-day trial, G2 4.7 from 124 reviews, claims "10,000+" teams (C4).
- Others observed in results, prices not checked: BankConv (domain registered 2024), invoicedataextraction.com (2024), Nanonets, Klippa, Parsio, Smallpdf, Zamzar, Lido, Pelcro (free tool), and several 2025-era iOS apps (B10, B11).
- Free substitutes: Excel Power Query, Google Sheets import, Tabula, and general AI assistants.

**Unmet need:** not established. The visible themes are accuracy checks and privacy of financial documents. **Unverified.**

**Newcomer traction:**
- 2 of 16 dated ranking domains registered in 2024 (B10; weak).
- No traffic or revenue data for newcomers.

**Acquisition:**
- Transactional queries (e.g. "convert pdf bank statement to csv").
- A free first conversion leads to a paid plan, bought via MoR checkout.
- **Risk:** AI Overviews are spreading into commercial queries (C8).

**Seller eligibility and payments:**
- Paddle covers 200+ seller countries (A13). Lemon Squeezy lists bank-payout countries (A14).
- Stripe is invite-only in India (A15), which is relevant only if the founder is based there.
- The MoR handles sales tax.

**Costs (assumptions):**
- Document processing $0.005–$0.02/page.
- Hosting ~$150/mo.
- MoR fee 5% + $0.50 per transaction. **Verify on the chosen MoR's official pricing page.**

**Operating burden:**
- Financial-data security and privacy obligations (GDPR for EU customers).
- Support when accuracy fails.
- Moderately automatable.

**AI-substitution risk: HIGH.** A general AI assistant can already read a statement PDF. A paid product survives only on:
- batch volume;
- bank-specific accuracy with reconciliation checks (totals must match);
- privacy guarantees;
- direct exports to accounting tools.

**Financial scenarios (churn and conversion are hypotheses):**

| Scenario | Price/mo | Net/sub | Subscribers | New subs/mo at steady state | Monthly visitors needed at visitor→paid 0.5% / 1% / 2% |
|---|---|---|---|---|---|
| Conservative | $15 (10% churn) | $10.75 | 1,016–1,264 | 102–126 | 20k–25k / 10k–13k / 5k–6k |
| Base | $29 (7% churn) | $26.05 | 419–521 | 29–37 | 5.9k–7.3k / 2.9k–3.7k / 1.5k–1.8k |
| Optimistic | $59 (5% churn) | $54.80 | 199–248 | 10–12 | 2.0k–2.5k / 1.0k–1.2k / 0.5k–0.6k |

The visitor figures cover only replacement of churned subscribers. Reaching the base needs additional acquisition volume.

**Evidence needed:**
1. Proof that young sites capture traffic for these queries.
2. Measured visitor→trial→paid rates from a real tool.
3. An accuracy advantage over a free AI assistant.

---

## 3. Lawful pay-per-event Apify utilities (50/100), failing the income model

**Category evidence (B7, B8; top 10 per term, users per 30 days):**

| Category | Combined users (top 10) | Leader |
|---|---|---|
| Email verification | 743 | 505 |
| Website screenshot | 1,954 | Apify's own actor, 1,563 |
| OCR | 779 | Google Lens actor (third-party scraping) |
| Transcription | 289–474 | — |
| PDF→markdown | 77 | — |
| VAT validation | 7 | — |
| LEI lookup | 21 | — |
| Sanctions screening | 13 | — |
| JSON schema validation | 2 | — |

Nearly every top-10 actor in these categories was created in 2025–26, so newcomers can be found. But **demand per category is small and prices are $0.001–$0.02 per event.**

**Payments and eligibility (P, H):**
- Apify bills users and pays out monthly: PayPal/Wise ≥$20, other methods ≥$100 (A9).
- Identity check for individuals or companies (A9). Publishers must be 18+ (A8).
- An actor whose price doesn't cover its platform costs earns $0 that month (A9).

**Financial scenarios:**

| Scenario | Price/event | Platform cost share | User spend needed/mo | Billable events/mo |
|---|---|---|---|---|
| Conservative | $0.002 | 40% | $26.9k–$33.6k | 13.5M–16.8M |
| Base | $0.005 | 25% | $19.6k–$24.4k | 3.9M–4.9M |
| Optimistic | $0.02 | 10% | $15.4k–$19.2k | 0.8M–1.0M |

The largest lawful categories show only hundreds of monthly users. Revenue per user is unknown (not published).

**Verdict:** a possible low-cost probe or side income. **Not a credible path to $8k–$10k/month** within the lawful scope on current evidence.
