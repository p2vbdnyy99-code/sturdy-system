# Checks: /insights Tender feed card layout fix

Local harness only (port 8790, local test database with synthetic accounts and visits).
Two feed states: **mixed** (central fresh 1 h, state delayed 5 h, GeM stale 3 days, failing)
and **unavailable** (all three last read 23 Oct 2026, failing). Each at 390 and 1366 px.

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Baseline recorded on the unfixed build | done | `before/`: every card's size, layout signature, text and screenshot |
| 1 | The check catches the defect (control run on the unfixed build) | pass | unavailable: 16 failures, e.g. status 10 px wide on 30 lines, rows ~700 px, card 2,228–2,291 px; other cards unchanged between two runs |
| 3 | Fresh, Delayed, Stale and Unavailable shown with the right words | pass | mixed: "Fresh", "Delayed", "Stale"; unavailable: "Unavailable (failing for over 7 days)" ×3 |
| 3 | No one-letter wrapping | pass | every status on 1–2 lines and at least 60 px wide, at 390 and 1366 px |
| 3 | No excessive height | pass | every row ≤ 110 px; card 455 px at most (unavailable, 390 px), was 2,291 px |
| 3 | No horizontal overflow | pass | card and page scroll width ≤ client width |
| 3 | Last success, last failure and error still shown | pass | all rows; failure line with "CPPP answered 404" when failing |
| 3 | Other cards unchanged | pass | Visitors per day, Funnel, Activity per day, Where visitors came from, Campaigns, Top pages, Search and AI crawlers, Pages crawlers read, Accounts: same size, same layout and same text (relative times like "3 min ago" compared as "N ago") |
| 3 | "Latest activity" | changed back | 110 px shorter: v55's `gap: 10px` between its 12 rows is gone; same text and rows, each row 10 px higher than the one before. Its rules are now identical to before v55 (2f1affc) |
| 3 | v55 freshness check still passes (selector renamed) | pass | fresh 22/22, stale (23 Oct) 31/31 |
| 3 | No page errors | pass | all runs |
| 4 | verify.sh | pass | backend 752/466/373 pass, 0 fail; build; lint 0 errors (18 warnings); frontend unit tests 88/88; secret scan clean |
| 4 | git diff --check and secret scan | pass | clean |
