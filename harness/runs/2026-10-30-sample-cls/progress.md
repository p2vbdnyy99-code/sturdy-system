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

## Release (2 Nov 2026)
- Deployed `f90b98a` on the founder's "deploy" as Fly release v53 (rollback:
  v52). Before: 0 tenders analysing or being read. Not pushed to GitHub.
- Live: public pages, .md, data API, health, llms.txt and sitemap answer 200;
  /sample-analysis has the data block, the app's h1, no loading text, the
  same title and canonical; 32.9 KB gzipped.
- Lighthouse mobile on the live page ×3: CLS 0.000 each (was 0.606);
  performance 80 / 96 / 100 (was 75).
- Live browser check (390 px): CLS 0, no CSP violations or errors, no
  horizontal scroll, page-number popover opens, opening from the home page
  link loads the sample.

## Next action
Push on the founder's word. Re-check PageSpeed Insights field data in about
4 weeks (CrUX is a 28-day window).
