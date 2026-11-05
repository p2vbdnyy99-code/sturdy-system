# Progress: home page and copy freshness patch (5 Nov 2026)

## Plan
- Steps 1–4 done and verified locally (checks.md).
- Stopped for the founder's review. No commit, push or deploy.

## Outputs
- **Changed:**
  - `frontend/src/tenders/freshness.ts` (`homeBandView`);
  - `frontend/src/tenders/freshness.test.ts` (+5 tests);
  - `frontend/src/pages/Home.tsx`, `Faq.tsx`, `Features.tsx`;
  - `frontend/src/index.css`;
  - `BIDPILOT_ARCHITECTURE.md`.
- **Run folder:** this folder, with `home-browser-check.cjs` and the
  screenshots `home-band-<state>-<width>.png`.

## Decisions
- **Delayed lists** (2–24 h) keep the usual "open" labels on the home page
  (the brief named stale and unavailable only). The tender list pages
  still show their info notice for delayed lists.
- **The band's search button** said "Search N open tenders". With a stale
  list it now says "Search N tenders from our last update" (same band, same
  claim).
- **Placement.** The note sits under the counts; no layout shift was
  measured on load.

## Open issues
- Nothing is verified in production until a deploy.

## Review corrections (after handoff #25)
- **Done:** steps 5–8 of plan.md, all checks pass (checks.md).
  - The earlier list checks take a state and confirm the server is in it.
  - The home check adds delayed and unknown.
  - `state-checks.sh` runs every check in six local states.
  - Screenshots are in `state-checks/`; committed screenshots are unchanged.
- **Product code:** unchanged; delayed and unknown behaviour reported, not changed.
- **Found while checking:** in the "unknown" case with a failed facets
  request the band shows "—" over "open"; with freshness missing it shows
  the usual "open" wording. Neither shows a date or a "right now" claim.

## Next action
The founder reviews it, then decides on commit.
