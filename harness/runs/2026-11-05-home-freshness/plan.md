# Run: home page and copy freshness patch (5 Nov 2026)

Approved by the founder after handoff #24. Scope:
- **Home page count band:** keep the three counts. When a list is stale or
  unavailable, its label becomes "open in our last update" and a note gives
  the last update date and says newer tenders are missing. Each list is
  judged on its own date, so different dates are named separately, never
  one common date. When fresh, the band looks as before.
- **FAQ and Features:** qualify the saved-search promise.
- **Tests:** fresh, stale and missing states; browser checks at 390 and
  1366 px for layout shift and overflow; the full `verify.sh`.

Not allowed: discovery, database, pricing or CPPP configuration changes;
the daily posts stay paused; no commit, push or deploy.

| # | Step | Files | Check |
|---|---|---|---|
| 1 | Wording rules | `frontend/src/tenders/freshness.ts` (`homeBandView`) | unit tests: fresh, delayed, unknown, stale on one date, stale on different dates, one list stale, never read |
| 2 | Band | `frontend/src/pages/Home.tsx`, `index.css` | browser: labels, note, button, at 390 and 1366 px in 4 data states; layout shift; overflow |
| 3 | Copy | `frontend/src/pages/Faq.tsx`, `Features.tsx` | browser: the new sentences are shown |
| 4 | Verify | `verify.sh` | all green |

The search button in the same band also said "Search N open tenders". When
any list is stale it now says "Search N tenders from our last update"; it
is part of the count band.

## Review corrections (founder, after handoff #25)

The implementation is provisionally accepted. Test-quality corrections
only; no product code changes, and delayed or unknown behaviour is reported,
not changed.

| # | Step | Files | Check |
|---|---|---|---|
| 5 | Earlier list checks pass in both states | `../2026-11-04-phase1-measurement/list-browser-check.cjs`, `../2026-11-05-feed-freshness/freshness-browser-check.cjs`, `../2026-11-05-feed-freshness/delayed-check.cjs` | each first confirms the server is in the stated state; fresh asserts the existing fresh wording; stale asserts the dated count line and the warning, and that "right now" never appears; no earlier assertion removed |
| 6 | Home page delayed and unknown states | `home-browser-check.cjs` | delayed (server) and unknown (facets without freshness, null freshness, failed facets request): the current wording, no date, no current-data claim; delayed links to a search page with the "late" notice |
| 7 | One command for every state | `state-checks.sh` | runs fresh, delayed, stale (3 days), unavailable (23 Oct), stale on different days, never read, on the local harness only |
| 8 | Re-verify | `verify.sh`, `git diff --check`, secret scan | all green |
