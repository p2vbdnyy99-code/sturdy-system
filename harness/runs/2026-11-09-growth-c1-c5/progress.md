# Progress: growth sprint C1–C5

## Plan
All 10 steps done (plan.md). Nothing committed, pushed or deployed.

## Outputs
- Code: `frontend/src/sampleExcerpt.ts` (+ test), `pages/Home.tsx`, `pages/SampleAnalysis.tsx`,
  `pages/guides/GuideLayout.tsx`, the three guide pages, `index.css`, `backend/src/md/htmlToMd.js`.
- Checks: `checks.md` (all pass); browser script and screenshots in the scratchpad `c1c5/`.
- Docs: BIDPILOT_ARCHITECTURE.md section; CLAUDE.md sample rule and lesson 32; handoff 49.

## Decisions
- The hero card now uses the real sample instead of invented values (the founder's C2: "only an existing genuine sample-output excerpt").
- The hero's old text link to the sample was removed, because the new second button goes to the same page.
- The EMD fact spans the card's full width on phones (long value).
- The comparison cells are block elements, so its markdown version reads cleanly.

## Open issues
- None blocking. The /bidpilot/me 401 on public pages is the signed-out session probe, the same on live v56.

## Next action
Founder review. Ship only on "commit", "push" and "deploy". Before any deploy, check that no tender is ANALYZING.
