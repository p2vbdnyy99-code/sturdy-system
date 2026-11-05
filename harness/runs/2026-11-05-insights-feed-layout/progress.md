# Progress: /insights Tender feed card layout fix (5 Nov 2026)

- Steps 1–4 done (checks.md). Stopped for the founder's review. No commit, push or deploy.
- **Changed:** `frontend/src/pages/Insights.tsx` (class names), `frontend/src/index.css`
  (the card's 7 rules renamed, one comment), the v55 freshness check's selector,
  `BIDPILOT_ARCHITECTURE.md`. This run folder is new.
- **Side effect, intended:** "Latest activity" loses the 10 px gaps v55 added by accident.
- **Re-running:** `insights-layout-check.cjs <origin> before|after <mixed|unavailable>`; the caller
  sets the feed state in the local database and restarts the local server; `before` must be
  recorded on the unfixed build.
- **Evidence kept here:** every card's size, layout and text (`before/` and `after/`
  `*-sizes.json`, both states and widths) and six screenshots: the broken card
  (before, unavailable, 1366 px), the fixed card (mixed 1366, unavailable 1366 and 390),
  and "Latest activity" before and after (mixed 1366). The other card screenshots, which
  the after-mode pixel comparison reads, were left out to keep the repository small, so
  re-running `after` means recording `before` again on the unfixed build.
- **Next action:** the founder reviews, then decides on commit.
