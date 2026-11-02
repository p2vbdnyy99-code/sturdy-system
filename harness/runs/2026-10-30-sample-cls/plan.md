# Sample-analysis page layout shift (mobile CLS 0.61)

Task (founder, 30 Oct 2026): investigate and fix the mobile CLS of 0.61 on
/sample-analysis. Investigation and implementation only: no commit, push or
deploy.

Allowed changes: the sample page's server HTML (`backend/src/samplePage.js`,
its call in `server.js`), the page component
(`frontend/src/pages/SampleAnalysis.tsx`), the server-render entry
(`frontend/src/prerender.tsx`), their tests, and the docs. Not allowed: the
sample JSON, pricing, entitlements, sign-in, the analysis pipeline, other pages.

Run limit: one fix approach plus one revision; then report.

## Steps

1. **Confirm the starting state.** Reads git. Output: HEAD and a clean tree.
   Check: `git status --short` is empty; HEAD is c9ffe42.
2. **Reproduce.** Reads the built app on the local harness server (port 8790).
   Writes `$S/cls-measure.cjs`. Output: CLS per run and the shifting nodes,
   at 390x844 (DPR 3, touch, mobile UA), with 4x CPU throttling and a slow
   network on the sample-data request, 5 runs; plus a Lighthouse mobile run.
   Check: the baseline CLS is > 0.1 in every run and the sources are named.
3. **Find the cause.** Output: the elements that move and why (server HTML
   vs the app's first render vs the loaded render). Check: the layout-shift
   entries' sources match the explanation.
4. **Fix.** The server renders the same React page the app renders, with the
   sample data, and hands that data to the app in a non-executed JSON block,
   so the app's first render matches the HTML and needs no loading state.
   Check: unit test that the server HTML contains the app's page and the
   embedded data equals `sampleView()`; the old crawler content (key facts,
   points, checklist, closing date, PDF page links) is still in the HTML.
5. **Re-measure.** Same script, same settings. Check: CLS per run reported
   honestly; target < 0.1.
6. **Regressions.** `scripts/verify.sh --checks checks.md`; head, canonical,
   structured data, the markdown version and the JSON API unchanged
   (compared before/after); responsive check at 360, 390, 768 and 1366 px;
   the fallback when the server bundle is missing; no other page's HTML
   changed. Check: rows in checks.md.
7. **Review and document.** Independent review of the diff (a subagent with
   only the diff and the rules). BIDPILOT_ARCHITECTURE.md section;
   progress.md. Report `git diff --stat` and `git status`; stop.
