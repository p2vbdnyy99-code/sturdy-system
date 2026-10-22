# Plan: company profile optional for the first 2 tenders, then required with a dialog

**Task (user's words):** "this filling of company profile is looking
annoying. Make it optional, keep it open for 2 tries after that make it
mandatory by adding a notification/ dialogue box".

**Founder's answer:** a "try" is a tender. A company can upload and analyse
its first 2 tenders without a profile; from the 3rd, a dialog asks for the
profile and the action waits until it is complete.

**Rules:**
- No forced redirect to the profile after sign-in any more.
- Upload is allowed while the company has fewer than 2 tenders, or when
  the profile is complete.
- Analyse (and re-run) is allowed for the company's first 2 tenders (by
  upload time), or when the profile is complete.
- Otherwise the server answers 409 `profile_incomplete` (unchanged code,
  new wording) and the app opens the dialog.
- The eligibility check is unchanged: it already says "Complete your company
  profile to check eligibility" when there is no profile.

**Allowed changes:** backend tender routes and a small gate module,
frontend shell, dashboard, tender page, profile page, CSS, FAQ, privacy
wording, docs, tests, this run folder. No migration.

**Run limit:** this session. Stop before commit.

| # | Step | Files | Output | Check (written before the work) |
|---|---|---|---|---|
| 1 | Server gate | new `bidpilot/profileGate.js`; `routes/tenders.js` | `FREE_TENDERS_WITHOUT_PROFILE = 2`; upload and analyse rules above | HTTP tests: 1st and 2nd upload 201 without a profile, 3rd 409 with `missing`; analysing one of the first 2 is allowed, a 3rd tender is refused and stays NOT_STARTED; complete profile → 3rd upload 201; other companies' tenders don't count |
| 2 | Shared constant | `frontend/src/shell/profileGate.ts`; sync test | the frontend knows the same number | `profile-fields-sync.test.js` fails if the two numbers differ; unit tests for the tries-left and notice wording |
| 3 | No redirect; dialog | `CompanyGate.tsx`, `AppShell.tsx`, new `components/ProfileRequiredDialog.tsx`, `api/client.ts` (error code) | the app opens on the dashboard; a modal dialog (native `<dialog>`) with "Fill in the profile" and "Not now" | browser: new company lands on the dashboard; the queue shows; uploading 2 tenders works; the 3rd upload opens the dialog and no file picker; "Fill in the profile" goes to the profile and, once complete, back; Escape and "Not now" close it; a 409 from Analyze also opens it |
| 4 | Gentle reminder | `Dashboard.tsx`, `CompanyProfile.tsx` | a small notice with tries left and a link; profile page wording says optional for the first 2 | notice wording per state (2 left, 1 left, 0 left, complete → none) |
| 5 | Text | `Faq.tsx`, `Privacy.tsx`, `OPERATIONS.md`, `BIDPILOT_ARCHITECTURE.md`, `CLAUDE.md` | text matches the code | no page still says the profile is required before the first tender |
| 6 | Checks | `verify.sh --checks`, browser script | checks.md | all pass; no CSP or console errors; phone width |
