| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Clean tree at c9ffe42 before any edit | pass | `git status --short` empty, HEAD c9ffe42 |
| 2 | Baseline CLS reproduced at 390x844 with named sources | pass | Playwright 390x844 DPR 3, 4x CPU, slow 4G: CLS 0.6521 in 5/5 runs (one shift at ~3.9 s); Lighthouse mobile 0.606 ×3 (= live PSI 0.606) |
| 3 | Shifting elements identified and explained | pass | sources: intro text node, p.sample-note, section.home-cta (y 576 → off-screen), footer.home-footer (y 820 → off-screen): the loading state left the CTA and footer in view; the data pushed them down |
| 4 | Server HTML = the app's page with the data; data embedded as non-executed JSON equal to sampleView() | pass | sample-page.test.js: app render in #root, data block = JSON(sampleView()) = API body, rendered from the same data; HTTP: no "Loading the sample" |
| 4 | Crawler content kept: key facts, points, checklist items, closing date, PDF page links | pass, with a change | every key fact, point and checklist item and the closing date in the HTML (test); 1,107 → 3,458 words (adds dates, BOQ, details). Changed: h1 is now the app's h1; PDF #page links 89 → 19 (BOQ; the rest are "p.N" buttons as in the app); the .md version keeps 114 page links |
| 5 | After-fix CLS, same test, every run | pass | Playwright: 0.0000 in 5/5 (0 shifts), also 5/5 behind gzip; Lighthouse mobile ×3: 0.000. Behind a gzip proxy (as Fly's edge): perf 75–77 → 98, FCP ~1.66 → ~1.81 s, full content in the DOM ~1.58 s → ~0.20 s, 1 request fewer |
| 6 | Head (title, description, canonical, robots, OG, JSON-LD) byte-identical before/after | pass | diff of <head> before/after: identical apart from the JS asset name; also a unit test |
| 6 | Markdown version and /bidpilot/public/sample-analysis unchanged | pass | byte-identical before/after (also llms.txt, llms-full.txt, sitemap.xml) |
| 6 | Sample JSON file unchanged | pass | `git diff --quiet HEAD -- backend/src/sample/` |
| 6 | Other public pages' HTML unchanged | pass | /, /features, /pricing, /faq, /about, /guides, /privacy-policy, /tender-consultants, /government-tenders byte-identical apart from the JS asset name |
| 6 | No horizontal page scroll at 360/390/768/1366; content and Cite popovers work | pass | sample-browser-check.cjs 26/26: loaded text identical old vs new at all 4 widths; no scroll; popover opens with PDF page link; details open/close; CTA works; in-app navigation fetches once |
| 6 | Fallback: missing server bundle → page still served with its text, app still loads | pass | unit test (plain HTML + data block, not cached); browser: fallback HTML → loaded page, no loading message, 0 shift |
| 6 | CSP: no inline script or style executed or blocked (no console CSP errors) | pass | served CSP unchanged; securitypolicyviolation listener: 0 at 4 widths and fallback (Chromium only) |
| 6 | No change to pricing, entitlements, auth or analysis code | pass | changed files: server.js (sample route), prerender.js, samplePage.js, sample test, SampleAnalysis.tsx, sampleData.ts, prerender.tsx |
| review | Finding 1: opened from a link inside the app on a slow network, no shift | pass | `cls-inapp.cjs`, RTT 400 ms, 400 kb/s: 0.652 (5/5) before the revision → 0.000 (5/5, no shifts) after; normal network 0.000 |
| review | Finding 2: a failing server render is cached once the bundle has settled, not redone per request | pass | server.js `prerenderSettled`; served page identical twice (HTTP test) |
| review | Finding 3: the data block's id is the same in server and app | pass | sample-page.test.js reads `sampleData.ts` |
| review | After the revision: direct load, browser checks, other pages, Lighthouse | pass | CLS 0.000 5/5; browser 26/26; other pages and the sample head byte-identical apart from asset names; Lighthouse ×3 behind gzip: perf 98, CLS 0.000, FCP 1.81–1.86 s |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 720, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 442, fail 0, skipped 29 |
| backend tests: no database | all backend tests pass | pass | pass 360, fail 0, skipped 46 |
| frontend build | type check and build succeed | pass | built in 386ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 75, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
