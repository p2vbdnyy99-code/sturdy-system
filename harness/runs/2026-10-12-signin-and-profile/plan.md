# Plan: Google and WhatsApp-OTP sign-in; mandatory company profile

**Task (user's words):** "integrate login/signup by google, apple, mobile
number (otp based). also make it mandatory that company profile needs to be
filled for better result".

**Founder's decisions:**
- OTP is delivered by WhatsApp (Meta Cloud API).
- Apple sign-in later (it needs a paid Apple Developer membership).
- Every profile field is mandatory.
- The profile must be completed before anything else, existing users
  included.

**Interpretation, stated to the user:**
- List fields (certifications, licences, equipment, OEM tie-ups, experience,
  geography) and "other qualifications" count as answered with at least one
  entry or an explicit "None".
- Scalar fields must have a value.
- Forcing invented entries would feed made-up data to the eligibility check.

**What the founder must supply** (they can't be done from here):
- A Google OAuth client ID and secret.
- A Meta WhatsApp Business setup: access token, phone number ID and an
  approved authentication template.
- Each provider stays hidden on the site until it's configured.

**Allowed changes:**
- `whatsapp-doc-assistant/` backend and frontend
- a new migration
- docs and this run folder

**Run limit:** this session. Stop before commit.

| # | Step | Files | Output | Check (written before the work) | Parallel? |
|---|---|---|---|---|---|
| 1 | Schema | `db/schema/identity.js`, `companyProfile.js`, new `authIdentities.js`, migration `0008` | `users.email` nullable; `users.phone` (unique) and `phone_verified_at`; `auth_identities` (provider, subject unique); `phone_otps`; `company_profiles.none_fields` | migration generated and reviewed (no destructive statements); applies locally; table-count test updated; `truncateAll` updated | first |
| 2 | Profile completeness | new `bidpilot/profileCompleteness.js`; companies repo and routes; tenders routes | `missingProfileFields()`; profile API returns `missing`; `/me` gives `profileComplete` per company; upload and analyze answer 409 `profile_incomplete` | unit: every field required, "None" accepted for list fields, 0 accepted for numbers, blanks rejected; HTTP: upload/analyze refused until complete, then allowed; other companies unaffected | after 1 |
| 3 | Profile UI + gate | `CompanyGate.tsx`, `CompanyProfile.tsx`, css | incomplete → profile page first, with every field marked required and "None" checkboxes; saving a complete profile → dashboard | browser: new user → company → forced to the profile; dashboard blocked until saved; save → dashboard; existing user with an empty profile is redirected | after 2 |
| 4 | Google sign-in | new `auth/google.js`, `routes/auth.js` | `GET /auth/google/start` (state + PKCE in a short-lived httpOnly cookie) → Google; `GET /auth/google/callback` exchanges the code, checks aud/iss/exp/email_verified, and finds or links or creates the user | tests with a stubbed token endpoint: new user created and signed in; existing identity reused; link to an existing email account drops its password and old sessions (pre-hijack defence); bad state, unverified email, wrong audience and expired token all refused; disabled → 404 | after 1 |
| 5 | WhatsApp OTP | new `auth/phoneOtp.js` (+ provider), `routes/auth.js` | `POST /auth/phone/start` and `/auth/phone/verify`; 6-digit code, hashed, 10-minute expiry, 5 tries; at most 3 sends per number per 15 minutes and 10 a day; per-IP limit; the code is never logged in production | tests: Indian number normalising; send → verify signs in and creates the user; wrong code counted and locked after 5; expiry; resend limits; a production log never contains the code; the provider builds the correct Meta template request | after 1 |
| 6 | Providers endpoint + UI | `routes/auth.js`, `Login.tsx`, `Register.tsx`, new `PhoneSignIn.tsx`, `AppHeader` | `GET /auth/providers`; "Continue with Google" and "Use mobile number" only when enabled; the header shows the phone when there's no email | browser: buttons hidden when disabled and shown when enabled (harness with test config); phone flow end to end with the dev provider; no CSP errors | after 4, 5 |
| 7 | Privacy + FAQ + docs | `Privacy.tsx`, `Faq.tsx`, `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md` (setup steps for Google and Meta), `CLAUDE.md` | text matches the code | policy names Google sign-in data, phone number, Meta/WhatsApp as a provider | last |
| 8 | Full checks | `scripts/verify.sh --checks checks.md` | checks.md | every row passes | last |
