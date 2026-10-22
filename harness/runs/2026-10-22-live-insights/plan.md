# Plan: live insights dashboard for the founder (22 Oct 2026)

Request: "build me live tracker as a dashboard either here or in my skylark
account about visits, signups, analysis, everything. make it futuristic."
Built inside the app, so it reads live data; only the founder's account sees it.
Nothing is deployed, committed or pushed without the founder's go-ahead.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Who may see it | `src/config.js` (`adminEmails`, env `BIDPILOT_ADMIN_EMAILS`, default the founder's existing Skylark email) | `isAdmin(user)` | unit test: listed email (any case) yes; other, missing email, phone-only no |
| 2 | Live numbers, one read-only query set | `src/bidpilot/insights.js` | live visitors (5 min), today, daily series, totals vs previous period, funnel, sources, campaigns, pages, devices, activity feed, accounts table, paid plans and monthly list-price revenue; the founder's own accounts and UNLIMITED companies excluded and listed separately | DB test with fixtures: counts per stage, founder's account excluded, previous-period delta, empty database gives zeros |
| 3 | Route | `src/bidpilot/routes/insights.js`, `server.js`, `/auth/me` `isAdmin` | `GET /bidpilot/insights?days=7|30|90` | HTTP test: 401 without session, 404 for a normal user, 200 for the founder; `/me` says `isAdmin` |
| 4 | Page | `frontend/src/pages/Insights.tsx`, `insights/chart.ts`, `api/insights.ts`, `routes.tsx`, `AppShell.tsx`, `index.css` | dark "mission control" page in the app shell; rail icon only for the founder; refresh every 30 s, previous render held during refresh; KPI tiles with sparklines; daily visitors chart with crosshair tooltip; funnel; sources and campaigns; activity feed; accounts table; daily table view | unit tests for chart helpers; browser check at 390 px and 1366 px on a local build with seeded data: no sideways scroll, no CSP errors, tooltip on hover and keyboard |
| 5 | Verify and document | `BIDPILOT_ARCHITECTURE.md`, this run | | `verify.sh --checks`; privacy policy unchanged (no new data collected) |
