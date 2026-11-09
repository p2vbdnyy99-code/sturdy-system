# Plan: Organic Growth Sprint conversion changes C1–C5 (handoff 48)

**Task (founder, 9 Nov 2026):** implement C1–C5 locally.

- No commit, push, publish, send or deploy.
- No change to pricing, analytics code, database or schema, model behaviour, tender-search collection, or production configuration.
- Sample-analysis content stays unedited.
- No time-saving or accuracy claims.
- Guide wording helps people locate and review clauses, and never decides an exemption for them.

**Production:** stays on v56.

## Source of truth for every real value

`backend/src/sample/aiims-bbsr-pump-motors.json` is TenderTez's stored, unedited analysis of the public AIIMS Bhubaneswar NIT, the one already shown at `/sample-analysis`.

- Every value shown in C1, C2 and C5 is copied exactly from that file into one frontend module.
- A unit test fails if any copied value differs from the file, or if its page differs.

## Steps

| # | Step | Reads | Writes | Output | Check |
|---|---|---|---|---|---|
| 1 | One module of exact sample excerpts, plus a test against the JSON | sample JSON | `frontend/src/sampleExcerpt.ts`, `frontend/src/sampleExcerpt.test.ts` | Excerpts: overview values, 2 points to check, 3 requirements, page count, point and requirement counts | `node --test` passes. Changing one character in an excerpt makes it fail (checked by hand once). |
| 2 | Section anchors on the sample page (`#key-facts`, `#dates`, `#points`, `#checklist`, `#boq`) | `SampleAnalysis.tsx` | same | Linkable sections; no text changed | Browser: anchors exist; sample text identical before and after (text hash of `main`, excluding the new button) |
| 3 | **C4:** "Analyse your own tender free" near the top of the sample page | `SampleAnalysis.tsx`, `index.css` | same | A button below the intro notes | Browser: visible in the first screen on desktop and within the first 1.5 screens on a phone; links to `/register` |
| 4 | **C1:** early, guide-specific box in each guide (EMD, eligibility, corrigendum), linking to the matching sample section and to sign-up. The existing end-of-guide box is kept. | `GuideLayout.tsx`, 3 guide pages, `index.css`, `backend/src/md/htmlToMd.js` | same | Box after the direct answer. EMD and eligibility boxes show real sample lines with pages. The corrigendum box states the corrigendum check only as the home page already does. | Browser: the box comes before 30% of page height on a phone; links resolve to existing anchors; no wording decides eligibility or exemption. Markdown output leaves the promotional box out, as it already does for `guide-cta`. |
| 5 | **C2:** home preview card uses the real sample (labelled "Real analysis", tender closed), with a "See the full analysis" link inside the card. Shown on phones as well as desktop. | `Home.tsx`, `index.css` | same | No invented values left on the home page | Browser: card visible at 390 px and 1366 px; every value matches `sampleExcerpt.ts`; the link opens `/sample-analysis` |
| 6 | **C3:** the hero's second button becomes "See a sample analysis". The duplicate text link goes. The tender band, the search pages and the stale warning stay. | `Home.tsx` | same | Two hero buttons: free trial, and sample | Browser: hero buttons; the tender band still shows its stale note; `/government-tenders` still shows its warning |
| 7 | **C5:** "By hand, or with TenderTez" section, using only sample facts. No time or accuracy claims. | `Home.tsx`, `index.css` | same | 5 rows: what to find, where you'd look by hand, what TenderTez's analysis of the AIIMS tender shows (value and page) | Unit test covers the values. Browser: readable at 390 px with no horizontal overflow. Grep: no "minutes", "faster", "accurate" or "%" claim added in the new copy, except the sample's own values. |
| 8 | Verify | — | `checks.md` | `verify.sh --checks` rows | All pass |
| 9 | Browser check: desktop and mobile home, 3 guides, sample, tender search | local build served by the backend | screenshots in the scratchpad | Rows in `checks.md` | All pass; no CSP errors; no layout shift on load |
| 10 | Document | — | `BIDPILOT_ARCHITECTURE.md`, `progress.md`, handoff 49 | Section added | — |

Steps run in order. No parallel sessions.

**Run limit:** three attempts per failing check, then stop and report.
