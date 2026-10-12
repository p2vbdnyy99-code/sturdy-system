# Progress: monthly subscription plans (2026-10-12)

## Plan
Steps 1–8 done. Nothing running or blocked.

## Outputs
- `whatsapp-doc-assistant/backend/src/bidpilot/plans.js` (new)
- `whatsapp-doc-assistant/backend/src/bidpilot/analysis/budget.js`, `routes/tenders.js`, `routes/dashboard.js`
- `whatsapp-doc-assistant/backend/scripts/subscription.mjs` (new)
- Tests:
  - `backend/test/bidpilot/plans.test.js` (new)
  - `analysis-budget.test.js`, `analysis.test.js`, `dashboard-summary.test.js`
- Frontend:
  - `src/allowance.ts` and `src/allowance.test.ts` (new)
  - `config/site.ts`, `api/dashboard.ts`
  - `pages/Pricing.tsx`, `pages/Faq.tsx`, `pages/Home.tsx`, `pages/Dashboard.tsx`, `pages/Privacy.tsx`
  - `index.css`
- `whatsapp-doc-assistant/backend/src/seo.js`
- Docs: `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md` (lessons 14–15, the script, the pricing rule)

## Decisions
- Monthly billing and no GST wording, per the founder's answers.
- Subscriptions are recorded by script after payment; nothing is charged
  automatically, and the site says so.
- "Latest ACTIVE period that includes now wins, a cancellation ends
  everything before it" lets an early renewal start when the current month
  ends.
- An ACTIVE row with no sold plan or no period no longer means unlimited. It
  falls back to the trial, and UNLIMITED is the explicit internal plan.
- No database migration: the existing `subscriptions` columns are enough.

## Open issues
- Production has no subscription rows, so no live account changes behaviour.
  The founder's own demo account would need `activate <id> UNLIMITED` once
  they sign up.
- Old prices still appear in places this change can't reach: the Google Doc
  proposal for India SME Forum (the Docs editor connector isn't available
  here) and the outreach emails already sent (₹499/₹999/₹1,999).
- The privacy policy's LAST_UPDATED says 12 October 2026. If the deploy
  happens later, change it to the deploy date.

## Next action
None. Deployed and checked live on 2026-10-12 (commit 9e71c41). When a firm
pays, run `subscription.mjs activate`. The founder's account needs UNLIMITED
once they sign up.
