# Plan: restyle the signed-in app after the Clinical OPD reference

**Task (user's words):** shared a screenshot of a clinic OPD redesign and
chose "Restyle the whole app": use this visual style across the signed-in
app (dashboard, tender page, company profile).

**Reference, translated to TenderTez:**

| In the reference | In TenderTez | Data source (no invented numbers) |
|---|---|---|
| Narrow icon rail (logo, icons, avatar at the bottom) | Replaces the top header: logo, Dashboard, Company profile, then the avatar and Log out at the bottom | existing routes, `/me` |
| Doctor panel: name, segmented "Today 3 / Seen 15", search, patient queue | Company panel: company name and plan; segmented "Due soon N / All N"; "Find a tender"; tender queue with a days-left chip; the open tender highlighted | `listTenders`, `getDashboardSummary` |
| "Dr. Iyer's day: 15 of 18 seen" bar | "Your plan: 3 of 5 tenders used" bar | `allowance` (hidden when there is no limit) |
| Breadcrumb, huge name, meta line, red and grey chips, a primary button top right | Breadcrumb; tender title; tender number, organisation, uploaded date; a red chip per high-severity red flag (count if many), then location and contract duration chips; "Run analysis" or "Check eligibility" top right | `getTender` overview, red flags |
| "Today's readings" card with rows | "Key facts" card: deadline, EMD, estimated value, tender fee, with evidence chips | overview |
| "Fasting sugar, last five visits" chart | "Dates" timeline: the tender's dates on one axis, with a today marker | `tender.dates` |
| Dark green "Suggested by the clinic protocol" card | Dark card "Deadline": big "12 days" left; below it the eligibility count if it has been run ("8 met, 2 not met, 3 unclear") and the button; footnote "Check the original document before you bid." No verdict, no advice | deadline, requirement statuses |
| Prescription card with one-tap chips | Requirements, BOQ, red flags and document stay as tabs, restyled as a segmented control on a soft card | unchanged |
| Past visits cards | Dashboard "Recently uploaded" as three cards | summary |

**Design decisions:**
- Colours: keep the TenderTez navy and saffron so the app matches the public
  site and logo; the dark card uses a navy gradient instead of green. If the
  founder wants the reference's green, only the tokens in `index.css`
  change.
- Font: keep the system font stack (the CSP allows only same-origin fonts;
  shipping a font file is possible but not needed).
- Shapes: large radii (20–28px), soft grey panels holding white cards, thin
  separators, pill chips, generous whitespace, big title type.
- Phone width: the rail becomes a top bar with the same icons; the company
  panel folds into a "Tenders" drawer on the tender page and sits above the
  content on the dashboard; no sideways scroll at 390px.
- Public pages (home, pricing, FAQ, login) are out of scope.

**Allowed changes:** `whatsapp-doc-assistant/frontend/src` (components,
pages, `index.css`), docs and this run folder. No backend or API changes.

**Run limit:** this session. Stop before commit.

| # | Step | Files | Output | Check (written before the work) | Parallel? |
|---|---|---|---|---|---|
| 1 | Baseline | harness, screenshots | before screenshots of dashboard, tender (completed, processing, failed), profile, onboarding at 1440 and 390 px | screenshots saved | first |
| 2 | Tokens and shell | `index.css`, new `components/AppShell.tsx` (rail + panel + main), `AppHeader.tsx` retired, `CompanyGate` pages wrapped | the three-column shell | browser: every signed-in page renders inside the shell; logout and nav work; keyboard focus visible; current page marked `aria-current` | after 1 |
| 3 | Tender queue panel | new `components/TenderQueue.tsx` | panel with company, plan, segmented filter, search, queue, allowance bar | queue lists only this company's tenders (API is already scoped); search filters; the open tender is highlighted; allowance bar matches `allowance` and hides when unlimited | after 2 |
| 4 | Tender page | `TenderDetail.tsx`, `KeyFacts.tsx`, new `tenderDetail/DatesTimeline.tsx`, new `tenderDetail/DeadlineCard.tsx` | breadcrumb + title + chips + action; key facts card; dates timeline; dark deadline card; restyled tabs | every value on screen comes from the API (unit test for the timeline's date placement and the deadline card's wording, including no deadline, past deadline and no eligibility run); processing, failed and needs-analysis states still show; tabs, evidence chips and document download work | after 3 |
| 5 | Dashboard | `Dashboard.tsx`, `TenderRow.tsx` | title row, stat tiles, dark "next deadline" card, recent cards, restyled table, filters and pagination | upload, filters, sort and pagination still work; empty state for a new company | after 3 |
| 6 | Company profile and onboarding | `CompanyProfile.tsx`, `CreateCompany.tsx` | sections as soft cards in the shell | profile save and "None" boxes still work; setup mode still sends to the dashboard | after 2 |
| 7 | Checks | `verify.sh --checks checks.md`, browser script | checks.md | all rows pass; at 1440 and 390 px: no sideways scroll, no CSP or console errors, no inline styles (`grep 'style={'` empty); after screenshots compared with the before set | last |
| 8 | Docs | `BIDPILOT_ARCHITECTURE.md`, `CLAUDE.md` if a rule changes, `progress.md` | section with what changed and the verification | text matches the screens | last |

## Changes during the run

- The frame became a layout route (`routes.tsx`) rather than a wrapper in
  each page, so the queue keeps its state between pages.
- Company setup stays on the sign-in layout (no company, so no queue).
- The tender page puts Key facts beside the dark card and Key dates beside
  the Details tabs; below 1400px the rows stack with the dark card first.
