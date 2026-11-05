# Run: /insights Tender feed card layout fix (5 Nov 2026)

Approved by the founder after handoff #28. A minimal CSS fix.

**Defect.** The Tender feed card (v55) reused the class `ins-feed`, which
already belonged to the "Latest activity" list. The activity list's rule
`.ins-feed li { grid-template-columns: auto 1fr auto }` outranked the
card's own one-column rule, so the status text wrapped one letter at a
time. In the other direction, v55's `.ins-feed { display: grid; gap: 10px }`
also reached the activity list.

**Fix.** The card gets its own class names (`ins-health…`), so neither card's
rules reach the other. No change to what the card shows or to monitoring.

Not allowed: home-page freshness, discovery, database, pricing or CPPP
configuration changes; production; commit, push or deploy.

| # | Step | Files | Check |
|---|---|---|---|
| 1 | Baseline | `insights-layout-check.cjs` (before) | screenshots and sizes of every /insights card, at 390 and 1366 px, with fresh, delayed, stale and unavailable lists |
| 2 | Rename the card's classes | `frontend/src/pages/Insights.tsx`, `frontend/src/index.css`; the v55 check's selector | build |
| 3 | Check | `insights-layout-check.cjs` (after) | each status on at most 2 lines; each row at most 110 px tall; no horizontal overflow; every other card pixel-identical to before, except "Latest activity" (reported) |
| 4 | Verify | `verify.sh`, `git diff --check`, secret scan | all green |
