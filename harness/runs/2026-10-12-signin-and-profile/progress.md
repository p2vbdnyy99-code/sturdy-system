# Progress: Google and WhatsApp-code sign-in; mandatory company profile (2026-10-12)

## Plan
Steps 1–8 are done and deployed (commit 223bd95, 12 Oct 2026). Apple
sign-in is deferred (the founder's choice).

## Outputs
- Schema:
  - `backend/src/db/schema/identity.js`, `companyProfile.js`
  - `authIdentities.js` (new)
  - `backend/drizzle/0008_high_morgan_stark.sql` (new)
- Backend:
  - `src/bidpilot/profileCompleteness.js` (new)
  - `src/bidpilot/auth/google.js`, `phoneOtp.js`, `externalSignIn.js` (new)
  - `routes/auth.js`, `routes/companies.js`, `routes/tenders.js`
  - `src/config.js`
- Tests:
  - `external-signin`, `profile-completeness`, `profile-fields-sync` and
    `profile-gate` (all new)
  - `test/db/helpers.js` (`completeProfile`, `truncateAll`),
    `test/db/connection.test.js`
  - `analysis`, `tender-detail` and `upload` tests
- Frontend:
  - `profileFields.ts` and its test (new)
  - `components/OtherSignIn.tsx` (new)
  - `auth/CompanyGate.tsx`, `pages/settings/CompanyProfile.tsx`
  - `pages/auth/Login.tsx`, `Register.tsx`, `components/AppHeader.tsx`
  - `api/auth.ts`, `api/companies.ts`
  - `pages/Privacy.tsx`, `pages/Faq.tsx`, `index.css`
- Docs: `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md`, `CLAUDE.md` (two rules
  and lesson 16)
- Checks: `checks.md` in this folder

## Decisions
- "Every field mandatory" is enforced, but list fields, GSTIN and other
  qualifications accept an explicit "None", so nobody has to invent data.
  Numbers accept 0.
- The gate is on the server (409 on upload and analyse) and in the app (the
  profile page opens first). Existing users are included.
- Google uses a server-side code exchange with PKCE. When a Google sign-in
  links to an email account that was never verified, that account loses its
  password and sessions (a defence against pre-account hijacking).
- WhatsApp codes are hashed, expire in 10 minutes and allow 5 tries, with
  per-number and per-IP limits. Codes are never logged in production.
- Each provider is hidden until its secrets are set, so the deploy changes
  nothing visible about sign-in.

## Open issues
- The founder must create the Google OAuth client and the Meta WhatsApp
  setup (steps in `OPERATIONS.md`), then set the Fly secrets in the
  dashboard.
- After the deploy, the two real accounts (Skylark and gem tender) will be
  sent to the profile page until their profiles are complete.
- The eligibility check doesn't yet read `none_fields`. It sees an empty
  list, as before.
- Privacy `LAST_UPDATED` must be the deploy day.

## Next action
None for this change. When the founder has the Google client and the Meta
WhatsApp setup, set the Fly secrets (see `OPERATIONS.md`) and check the
buttons appear and work live. Skylark and gem tender have no profile yet and
will be asked to fill it in at their next sign-in.
