# Sign-up goes straight to the dashboard; profile asked after 3 tenders

Founder's decision (26 Oct 2026): remove the "Set up your company" page that
every new user sees after sign-up, and ask for the company profile after 3
tenders instead of 2 (the free trial stays 5).

## Why

New users meet a form before they see anything. The page asks only for a
company name (industry and business type are optional and are profile fields
anyway). Every tender belongs to a company (company isolation), so a company
must still exist; it is now created automatically.

## Steps

| # | Step | Files | Output | Check (written before the work) |
|---|---|---|---|---|
| 1 | `ensureCompanyForUser(db, userId, name)`: returns the user's first company, or creates one with an owner membership. One transaction with an advisory lock on the user, so two tabs can't create two companies. | `backend/src/bidpilot/repo/companies.js` | function | Test: two parallel calls for a new user give the same company and one membership; a user who already has a company gets it back, nothing created. |
| 2 | `POST /bidpilot/companies/ensure` (session + CSRF): default name is the user's name, else "My company". Answers `{companyId, name, role, created}`. | `backend/src/bidpilot/routes/companies.js` | route | Test: 201 with created=true the first time, 200 with created=false after; name from the user's name; "My company" with no name; 401 without a session; 403 without CSRF. |
| 3 | `PATCH /bidpilot/companies/:id` `{name}`: rename your own company (company access required, 1–120 characters). | same | route | Test: a member renames; another company's user gets 404/403; blank name 400. |
| 4 | Free tenders without a profile: 2 → 3, both sides. | `backend/src/bidpilot/profileGate.js`, `frontend/src/shell/profileGate.ts`, their tests | constant | profile-gate tests: tenders 1–3 upload and analyse without a profile, the 4th answers 409 `profile_incomplete`; profile-fields-sync passes. |
| 5 | Funnel: a new account is a journey that reached `/onboarding/create-company` (old data) or the new virtual page `/signed-up`, recorded once by the app when ensure answers created=true. | `backend/src/bidpilot/visits.js`, `funnelReport.js`, `frontend/src/auth/CompanyGate.tsx` | route name + query | funnel-report test counts both paths; visits test normalises `/signed-up`. |
| 6 | CompanyGate: with no company, call ensure once, refresh the session, show "Setting up your workspace…" meanwhile and a retry button on error. `/onboarding/create-company` redirects to `/dashboard`; the CreateCompany page is removed. | `frontend/src/auth/CompanyGate.tsx`, `routes.tsx`, `pages/onboarding/CreateCompany.tsx`, `api/companies.ts` | UI | Browser: register with email → lands on /dashboard with no form; reload /onboarding/create-company → /dashboard; exactly one company for the user in the database. |
| 7 | Company name on the profile page, saved with the rename route. | `frontend/src/pages/settings/CompanyProfile.tsx` | field | Browser: change the name, reload, the new name shows in the rail/profile. |
| 8 | Wording: "first 2 tenders" → 3 in FAQ, Privacy, the profile dialog and comments. Privacy `LAST_UPDATED` set to the day it goes live. | `Faq.tsx`, `Privacy.tsx`, `ProfileRequiredDialog.tsx`, `CompanyProfile.tsx` | text | `grep` finds no "first 2"/"first two tenders" left; FAQ answer says 3rd → 4th. |
| 9 | Verify and document. | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md` | docs | `scripts/verify.sh --checks harness/runs/2026-10-26-skip-company-step/checks.md` all PASS. |

## Not changed

- Plans, prices and the free trial (5 tenders).
- Client workspaces (`/clients`): consultants still add clients by name.
- Existing companies and their names.

Commit, push and deploy only after the founder says so.
