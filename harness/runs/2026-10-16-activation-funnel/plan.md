# Plan: activation and funnel measurement (16 Oct 2026)

Request: rank growth changes by evidence, then implement the three
highest-value changes that can be verified safely. Full ranking:
`marketing/growth-plan.md`. Checkpoint: tag `checkpoint-2026-10-16-before-growth-fixes`
(= ddf4d33). No commit, push or deploy without the founder's go-ahead.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | "Ready to analyse" next step on the dashboard | `backend/src/bidpilot/repo/tenders.js` (summary `readyToAnalyse`), `frontend/src/dashboard/ReadyToAnalyse.tsx`, `pages/Dashboard.tsx`, `api/dashboard.ts`, `index.css` | Uploaded tenders with a PDF, extracted, never analysed, shown first with an Analyze button; same API call and profile gate; opens the tender after starting | `dashboard-summary.test.js`: only PDF + extracted + NOT_STARTED, newest first, company-scoped. Browser (phone 375 px, desktop): card lists the waiting tender only, button inside the first screen, no sideways scroll, no CSP errors, click starts analysis and opens the tender, card gone afterwards |
| 2 | Sign-ups by entry + upload activation in the visits report | `backend/src/bidpilot/funnelReport.js`, `scripts/visits-report.mjs` | Per first page/site/utm_source: journeys → /register → new account → app; uploads → analysed (24 h) → waiting; feed tenders | `funnel-report.test.js` on Postgres: grouping, window, returning user not counted as new, activation counts; run locally; baseline read-only in production |
| 3 | Follow-up to the consultancy with 2 waiting uploads | Gmail draft (founder sends) | Reply in the existing thread | Draft exists; nothing sent |
| 4 | Verify and document | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `marketing/growth-plan.md` | | `verify.sh --checks` |
