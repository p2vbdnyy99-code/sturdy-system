# Security fixes from the 28 Oct review (items 1–6)

The founder approved items 1–6 of the security review (the review itself
stays out of the repository; this plan names only the fixes). Item 7 (an old
CORS origin in a Fly secret) is separate and needs its own OK.

| # | Fix | Files | Check (written before the work) |
|---|---|---|---|
| 1 | The WhatsApp webhook refuses unsigned messages in production when `WHATSAPP_APP_SECRET` is unset (fail closed); development keeps working without a secret. | `src/whatsapp.js` | Test: no secret + production → rejected; no secret + development → accepted; valid/invalid signature unchanged. Live after deploy: an unsigned POST /webhook answers 401. |
| 2 | Update the server libraries with published advisories (proxy-addr, body-parser, multer, brace-expansion, qs) without major-version jumps. | `backend/package-lock.json` (+ `package.json` only if needed) | `npm audit --omit=dev` reports 0; all backend tests pass. |
| 3 | A site-wide daily ceiling on AI analysis calls (`BIDPILOT_ANALYSIS_MAX_CALLS_PER_DAY_GLOBAL`, default 1,500), checked with the per-company cap; and sign-ups limited per IP (`/register` 10 an hour; new Google sign-ins started 20 an hour). | `src/bidpilot/analysis/budget.js`, `src/config.js`, `src/bidpilot/routes/auth.js` | Tests: the global cap refuses with reason `global_daily_cap` and a plain message; the 11th registration from one IP in an hour answers 429; a different IP still works. |
| 4 | Login `?next=` only accepts a path on this site (starts with one `/`, not `//` or `/\`); and it is honoured (it was always replaced by /dashboard). | `frontend/src/auth/safeNext.ts`, `pages/auth/Login.tsx`, `auth/RedirectIfAuthenticated.tsx` | Unit test of the helper; browser: `?next=https://example.com` and `//example.com` land on /dashboard with no request to example.com; `?next=/company-profile` lands there. |
| 5 | Login attempts also limited per IP (30 per 15 minutes), in addition to per email. | `src/bidpilot/routes/auth.js` | Test: 31st failed login from one IP across different emails answers 429. |
| 6 | Headers: `Strict-Transport-Security: max-age=31536000` (HTTPS only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. | `server.js` | Test on the app's headers; live check after deploy. |

Then verify.sh, browser check, BIDPILOT_ARCHITECTURE.md (without exploit
detail), progress.md. Commit and deploy only after the founder says so.
