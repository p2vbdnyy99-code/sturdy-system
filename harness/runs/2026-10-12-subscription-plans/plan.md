# Plan: monthly subscription plans with limits

**Task (user's words):** "change the pricing to 8999 for 30 tenders, 5999 for
15 tenders and 3999 for 10 tenders and make this subscription based model".

**Answers to my questions:** charged monthly; no GST mention; prices plus
plan limits, with subscriptions switched on by hand until Razorpay is
connected.

**Deliverable:**
- The public site shows the three monthly plans.
- A subscribed company gets its plan's tenders per monthly period.
- An ops script starts, renews and ends subscriptions.

**Allowed changes:**
- `whatsapp-doc-assistant/` backend and frontend
- docs
- this run folder

No database migration: the `subscriptions` table already has plan, status and
period columns.

**Run limit:** this session. Stop before commit.

| # | Step | Files | Output | Check (written before the work) | Parallel? |
|---|---|---|---|---|---|
| 1 | Plan catalogue | new `backend/src/bidpilot/plans.js` | STARTER 10/₹3,999, GROWTH 15/₹5,999, PRO 30/₹8,999, internal UNLIMITED | unit test: values; unknown plan → null | yes |
| 2 | Allowance + claim | `analysis/budget.js` | `getAllowance()`, `claimTenderSlot()` replacing the trial-only versions | tests: trial unchanged (5, re-run free, deleted tender keeps slot, race); ACTIVE plan with current period allows N new tenders in the period, then 402 `plan_exhausted`; re-run of a counted tender is free; a new period resets the count; past period → `plan_expired`; UNLIMITED has no limit; ACTIVE without a known plan or period falls back to the trial; CANCELED → trial | after 1 |
| 3 | Route + dashboard API | `routes/tenders.js`, `routes/dashboard.js` | 402 with code; summary `allowance` | HTTP tests: 402 codes, summary shape for trial, plan and unlimited | after 2 |
| 4 | Ops script | new `backend/scripts/subscription.mjs` | `status`, `activate <companyId> <PLAN> [months]`, `cancel` | run on local db: activate → allowance shows the plan; cancel → back to trial | after 2 |
| 5 | Frontend | `config/site.ts`, `Pricing.tsx`, `Faq.tsx`, `Home.tsx`, `Dashboard.tsx`, `api/dashboard.ts`, new `allowance.ts` (+ test) | new prices, monthly wording, subscribe-by-email, dashboard plan notice | unit test for the notice text; build, lint; browser: pricing shows the 3 plans; dashboard shows trial, plan and exhausted states; no CSP errors; phone width | after 3 |
| 6 | Search + privacy text | `seo.js`, `Privacy.tsx` | pricing description; privacy mentions the plan and its dates | seo tests; the policy states what is stored | yes |
| 7 | Docs | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md` if a lesson lands | sections | they name every file changed | last |
| 8 | Full checks | `scripts/verify.sh --checks checks.md` | checks.md | every row passes | last |
