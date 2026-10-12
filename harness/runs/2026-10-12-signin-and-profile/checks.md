| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 553, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 362, fail 0, skipped 18 |
| backend tests: no database | all backend tests pass | pass | pass 293, fail 0, skipped 29 |
| frontend build | type check and build succeed | pass | built in 1.19s |
| frontend lint | lint exits 0 | pass | 10 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 29, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 schema | migration is additive; applies locally; table count and `truncateAll` updated | pass | `0008_high_morgan_stark.sql`: two new tables, new columns and indexes; the only `DROP` is `users.email DROP NOT NULL`; no data deleted. Applied to `bidpilot_dev` (9 migrations). `connection.test.js` expects 25 tables |
| 2 completeness | every field required; "None" only where allowed; 0 counts for numbers; blanks rejected | pass | `profile-completeness.test.js` 5/5 |
| 2 completeness | frontend and backend list the same 15 fields | pass | `profile-fields-sync.test.js` 2/2; `profileFields.test.ts` 2/2 |
| 2 gate | upload and analyse answer 409 `profile_incomplete` with the missing fields; `/me` flips to complete; then upload is accepted (201) | pass | `profile-gate.test.js` 6/6 (database + CSRF secret setup) |
| 4 Google | new user created and signed in; return visit reuses them; linking to an unverified password account drops its password and other sessions; bad state, unverified email, wrong audience, wrong issuer and expired token refused; disabled → 404 | pass | `external-signin.test.js` (Google part), stubbed token endpoint |
| 5 WhatsApp code | number normalising; send → verify signs in; wrong code counted, locked after 5; expiry; one use only; 3 per 15 min per number; the Meta template request is correct; a production log never contains the code | pass | `external-signin.test.js` (phone part); 23/23 in total |
| 5 WhatsApp code | the new HTTP tests skip, like the other HTTP tests, when no CSRF secret is set | pass | first verify run: "database only" 11 fails (`BIDPILOT_CSRF_SECRET is not set`); added the same `SKIP_REASON` as `auth.test.js`; rerun 0 fails |
| 6 providers | `GET /auth/providers` is `{google:false, phone:false}` without config | pass | `external-signin.test.js`; the buttons render nothing when both are false (`OtherSignIn.tsx`) |
| 3+6 browser | sign-up shows Google and mobile buttons (harness with test config); phone flow end to end; wrong code shows an error; new company → profile; dashboard blocked until complete; 15 required markers, 8 "None" boxes; partial save names the missing fields and highlights 14; a complete save opens the dashboard; email sign-up also lands on the profile; login explains a failed Google sign-in; phone width fits; no CSP or console errors | pass | `signin-verify.mjs` on the harness: 22 meaningful checks pass. A 23rd check asserted nothing and is not counted |
| 7 docs | privacy names Google sign-in, phone number, Meta (WhatsApp), the OAuth cookie and OTP retention; FAQ explains the mandatory profile; architecture, operations and CLAUDE.md updated | pass | `git diff OPERATIONS.md`: +29, 0 deletions. Privacy `LAST_UPDATED` is still 12 October 2026: set it to the deploy day |
| 8 live | nothing mid-analysis; migration applied before the code that needs it | pass | `analyzing_now=0`, `__drizzle_migrations` 8 before; 0008 applied in the machine with drizzle's migrator before the deploy (additive, so the old code kept working): 8 → 9, `users.phone`, `phone_verified_at`, `company_profiles.none_fields`, `auth_identities`, `phone_otps` present |
| 8 live | deploy healthy | pass | `flyctl deploy` exit 0 (commit 223bd95); `/health` 200 |
| 8 live | sign-in providers hidden until configured | pass | `/bidpilot/auth/providers` → `{google:false, phone:false}`; `google/start` and `phone/start` → 404; /login and /register show 0 extra buttons, the email form, no sideways scroll at 390px |
| 8 live | pages and policy | pass | login explains `google_failed`; privacy "Last updated: 12 October 2026", names Google sign-in, Meta and WhatsApp; FAQ has the profile question; `/company-profile` signed out → /login; `/bidpilot/me` and upload signed out → 401; no console or CSP errors |
| 8 live | the profile gate with a signed-in user | unresolved | not exercised live: it would mean creating an account in the production database. Covered locally by `profile-gate.test.js` and the browser check. Read-only query: Skylark and gem tender have no profile yet, so both will be sent to the profile page |
