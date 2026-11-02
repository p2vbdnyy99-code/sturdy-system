# Progress: sample-analysis layout shift

## Plan
- Steps 1–6 done (see checks.md, all pass).
- Step 7: architecture section written; independent review done ("ship with
  changes"); findings 1–3 fixed as the one allowed revision and re-verified.
- Committed on the founder's "commit" (2 Nov). Not done: push, deploy (each
  needs its own go-ahead). The h1 question was left as is (the app's h1).

## Outputs
- Code: `backend/src/samplePage.js`, `backend/src/prerender.js`,
  `backend/server.js`, `backend/test/sample-page.test.js`,
  `frontend/src/pages/SampleAnalysis.tsx`, `frontend/src/pages/sampleData.ts`
  (new), `frontend/src/prerender.tsx`.
- Docs: `BIDPILOT_ARCHITECTURE.md` (section "The sample analysis page no
  longer jumps on phones").
- Measurement: `cls-measure.cjs`, `gzip-proxy.mjs`,
  `sample-browser-check.cjs`, `cls-inapp.cjs` (this folder).

## Decisions
- Fixed the cause (the loading state, then content inserted above the CTA
  and footer) by giving the app's first render the data, instead of
  reserving space or hiding overflow.
- Server HTML is now the app's own render, so it matches what visitors see,
  as on the other public pages (prerender), rather than a different plain
  layout.
- The old plain HTML stays as the fallback when the server bundle isn't
  loaded; that response is not cached.
- Review finding 1 (in-app navigation) reproduced before fixing it: 0.652
  on a slow network. Fixed with a full-screen loading section, so nothing on
  screen is pushed down; the CSS class is `.sample-loading`.
- Compared old and new builds side by side (HEAD in a temporary worktree on
  port 8791) and behind a gzip proxy, because the local server doesn't
  compress and Fly's edge does.

## Open issues
- For crawlers that don't run JavaScript, the h1 changes and the per-item
  PDF page links fall from 89 to 19 (the founder decides whether that
  matters; the .md version keeps them).
- Plain HTML is served for a moment after each restart, until the server
  bundle loads (the page then still has the data, so no loading state).
- First paint ~0.15 s later behind gzip (bigger HTML); the full content
  arrives ~1.4 s sooner and the JSON request is gone.
- Not measured on a real phone, Safari or Firefox; field CLS (CrUX) will lag
  any deploy by up to 28 days.

## Next action
Only on the founder's word: push; then deploy (check no tender is ANALYZING
first) and re-run PageSpeed Insights on the live page.
