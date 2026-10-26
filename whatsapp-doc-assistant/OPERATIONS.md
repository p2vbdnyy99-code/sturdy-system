# Papyr — Operations Runbook

How Papyr runs in production and how to recover when it breaks. Written from
real incidents during beta.

## Architecture (one line)

WhatsApp Cloud API (Meta) → webhook → **Node/Express server on Render** →
pdf.js / Tesseract / docx / exceljs → reply on WhatsApp. No document is ever
written to disk.

## Deploy

- Code lives on branch `claude/whatsapp-ai-document-assistant-*`; Render builds
  from the connected repo, with **Root Directory = `backend/`**.
- Pushing new commits triggers a Render deploy. **Avoid pushing several commits
  in quick succession** — overlapping deploys create a window where messages
  sent mid-rollover are dropped (seen in beta). Push, let one deploy finish,
  then test.
- **Since Milestone 5b (Tenderlytic frontend):** Render's dashboard **Build
  Command** must be set to `npm install && npm run build` (was previously
  whatever Render's zero-config Node default was — effectively just `npm
  install`). `npm run build` (backend's own `package.json`) installs and
  builds `frontend/` via `npm --prefix ../frontend`, producing
  `frontend/dist/`, which `server.js` then serves statically. **Start
  Command stays `npm start`, unchanged.** This ordering matters: backend
  dependencies must finish installing before the frontend build step runs
  (the build script assumes nothing from `npm install`, but Render's own
  deploy sequence must still do `install` before `build` before `start`).
  A Papyr-only checkout that never runs the build step is unaffected —
  `server.js` checks for `frontend/dist/index.html` before mounting any
  frontend routes and simply skips them if it's absent.
  This dashboard change has not been applied or verified against the live
  Render service from this environment (no `render.yaml`/API access here) —
  apply it in the Render dashboard directly.

## Tenderlytic backend deploy (Fly.io) — separate from Papyr above

Tenderlytic (the BidPilot product) is now deployed independently of the
Papyr WhatsApp bot's Render service, on Fly.io — chosen specifically for
its persistent volumes, which let `BIDPILOT_STORAGE_DRIVER=local` survive
redeploys without needing an S3/R2 dependency (Render's standard web
service disk is ephemeral and would lose every uploaded tender PDF on the
next deploy). Config: `../Dockerfile` and `../fly.toml` (repo root's
sibling of `backend/`/`frontend/`, since the Docker build needs both).

**Live** at https://tenderlytic-api.fly.dev/ (app `tenderlytic-api`, Postgres
`tenderlytic-db`, region `sin`, one machine). Notes from running it:

- **Deploying from the Claude Code sandbox needs `fly deploy --depot=false`**.
  The default Depot builder's long-lived tunnel gets cut by the sandbox's
  outbound proxy. From a normal machine plain `fly deploy` works.
- **Node 22 is required** (Dockerfile). On Node 20 the PDF library's OCR
  worker hangs until the 3-minute OCR timeout kills it: scanned pages get no
  text, and any PDF with an image page takes ~3 minutes to extract.
- **1 GB memory** (fly.toml): headroom for OCR child processes alongside
  concurrent analyses.
- **A dropped database connection used to crash the server** (1 Oct: the
  process exited mid-analysis). Fixed: the pool now logs
  `bidpilot db: idle connection dropped` and reconnects. If that warning
  shows up often, look at the `tenderlytic-db` machine.
- **Domains:** https://tendertez.in (main), plus www.tendertez.in, tendertez.com and
  www.tendertez.com, all on Fly certificates (`fly certs list`). DNS is at Hostinger:
  `@` A `66.241.124.41` and AAAA `2a09:8280:1::196:8804:0`, `www` CNAME to the apex.
  The original https://tenderlytic-api.fly.dev still works.
- **Required secret beyond the list below:** `BIDPILOT_PUBLIC_BASE_URL=https://tendertez.in`
  (was the fly.dev address until the domain went live).
  Without it, signed document-download links point at `localhost`.
- **Migrations are NOT run on deploy.** New `drizzle/` migrations must be
  applied by hand: `fly proxy 15432:5432 --app tenderlytic-db`, then run
  drizzle-orm's migrator against `localhost:15432` with the production
  credentials. Deploy the migration before the code that needs it.
- **Restarts are recoverable.** On boot, any tender left mid-extraction or
  mid-analysis is marked FAILED ("interrupted by a server restart"), so users
  can retry instead of being stuck. This assumes one machine; running two
  would need a different mechanism (see `backend/src/bidpilot/recovery.js`).
- **Watch the OpenAI credit balance.** When it runs out, every analysis and
  eligibility check fails, and the app reports it as "OpenAI rate limit
  exceeded".
- **Analysis runs on OpenAI's Flex tier** (`BIDPILOT_ANALYSIS_FLEX`, on by
  default): same model, half the price. A section Flex can't serve (no
  capacity, error, or no answer within `BIDPILOT_ANALYSIS_FLEX_TIMEOUT_MS`,
  default 2 minutes) is retried once on standard. Count fallbacks with
  `grep "metric ai_flex_fallback"`; `metric ai_call ... tier=` shows which
  tier served each call. If fallbacks are frequent, analyses are slower and
  cost close to full price: set `BIDPILOT_ANALYSIS_FLEX=false`.
- **Spend limits.** Each company may make
  `BIDPILOT_ANALYSIS_MAX_CALLS_PER_COMPANY_PER_DAY` analysis calls in any
  24 hours (set to 40 on Fly, about 5–8 tenders). Each company without an
  ACTIVE subscription may analyse `BIDPILOT_TRIAL_TENDERS` different tenders
  (default 5, the free trial); re-running a counted tender is free, and `0`
  switches the trial limit off.
- **Search and link previews.** Each public page's title and description
  live in `backend/src/seo.js`. `BIDPILOT_REDIRECT_HOSTS` (comma-separated)
  sends www and .com page loads to `BIDPILOT_PUBLIC_BASE_URL`.
- **Visits and sign-ups report:** `fly ssh console --app tenderlytic-api -C
  "sh -c 'cd /app/backend && node scripts/visits-report.mjs 7'"` (any number
  of days). The site counts visits itself; see BIDPILOT_ARCHITECTURE.md,
  "Visit counting". Tag links you share with `?utm_source=<name>` (e.g.
  `https://tendertez.in/?utm_source=linkedin`) to see which ones bring
  visitors. The report also shows **uploads** (how many reached an analysis,
  within 24 hours, and how many are waiting for the Analyze click) and
  **sign-ups by entry** (first page, site and `utm_source` → saw `/register`
  → new account → reached the app; same-day journeys only, because visitor
  ids reset daily). The marketing workspace uses `utm_source=<channel>.<campaign>`.
- **Sample analysis** (`/sample-analysis`): the stored output of one real
  analysis of a public AIIMS Bhubaneswar tender
  (`backend/src/sample/aiims-bbsr-pump-motors.json`). To make a new one,
  change the URL and SHA-256 in `scripts/sample-analysis-run.mjs`, run it in
  the machine (`fly ssh console --app tenderlytic-api -C "sh -c 'cd /app/backend
  && node scripts/sample-analysis-run.mjs'"`; it costs one analysis and writes
  nothing to the database), save the JSON after `SAMPLE_JSON `, check every
  quote against the PDF, then update the page's intro text and tests.
- **Google Search Console** (which Google searches show TenderTez, clicks,
  and indexing problems). Nothing runs on the site for it.
  1. At https://search.google.com/search-console, add a **Domain** property
     for `tendertez.in`, using the Google account that should own it.
  2. Google shows a TXT record. tendertez.in's DNS (Hostinger) already holds
     one `google-site-verification=…` record. If Google shows the same value,
     press Verify. If it shows a new one, add it as an extra TXT record on
     `@`. **Append only:** with the Hostinger API use `overwrite: false`. The
     same `@` TXT set holds the SPF record for email, and replacing the set
     would break sending.
  3. Under Sitemaps, submit `https://tendertez.in/sitemap.xml`. It lists
     every public page in `backend/src/seo.js` (`PUBLIC_PAGES`); signed-in
     pages carry `noindex` and are blocked in `robots.txt`.
- **Google Analytics 4 (sent by the server).** The browser loads no Google
  script and gets no cookie (the CSP stays `'self'`). The visit counter
  passes each counted visit to `backend/src/bidpilot/ga4.js`, which sends
  public pages only to GA4 as a `page_view` through the Measurement Protocol.
  Off until both secrets are set; the startup log says which.
  1. At https://analytics.google.com create a GA4 property (time zone India,
     currency INR) and a **Web** data stream for `https://tendertez.in`.
     Turn **off** Enhanced measurement: there is no tag on the site.
  2. In the stream, copy the Measurement ID (`G-…`). Under "Measurement
     Protocol API secrets", create a secret.
  3. Set the Fly secrets `BIDPILOT_GA4_MEASUREMENT_ID` and
     `BIDPILOT_GA4_API_SECRET` (dashboard → Secrets, so the secret never
     passes through chat). The machine restarts; check first that nothing is
     mid-analysis.
  4. Check in GA4 → Reports → Realtime while you open https://tendertez.in
     on a phone.
  5. Optional: in Admin → Custom definitions, add event-scoped custom
     dimensions `visit_source` and `visit_campaign`.

  What GA4 will and won't show:
  - Visitors are counted per day: the id changes daily, so "returning users"
    means within a day.
  - There's no country or city: no IP is sent.
  - GA4's own "Traffic acquisition" may say Direct or (not set) for
    server-sent views. The real source is in `visit_source` and
    `visit_campaign`, and in `visits-report.mjs`.
  - `BIDPILOT_GA4_ENDPOINT` can point at
    `https://www.google-analytics.com/debug/mp/collect` to check payloads
    (nothing is recorded there).
- **EMD and guarantees, saved-search alerts, annexure drafts (Oct 2026):**
  - They need migration 0011, which is additive: four tables and six
    optional profile columns.
  - The saved-search matcher runs in the app every 10 minutes and logs
    `metric bidpilot_alerts new_matches=N`.
  - Annexure drafts are one AI call each, at most
    `BIDPILOT_ANNEXURE_MAX_DRAFTS_PER_COMPANY_PER_DAY` (default 30) per
    company per 24 hours, recorded as `tender_annexure_draft` in
    `usage_records`.
  - Alerts are only shown in the app. An email digest needs an email
    service first (none is connected).
- **Server HTML, guides and crawler counts (Oct 2026):**
  - The frontend build also makes `frontend/dist-ssr/prerender.js`; the server
    renders the public pages from it (cached 6 hours). If it is missing, the
    log says `prerender: public pages served without server HTML` and the
    pages work as before. Check with
    `curl -s https://tendertez.in/pricing | grep -c '<h1>'` (should be 1).
  - The crawler counter needs migration 0012 (one additive table,
    `crawler_hits`). Until it is applied, crawler counts are not saved (a
    warning in the log) and /insights answers 500. Apply it right after the
    deploy.
  - `/government-tenders/state/keralam` now 301s to `/state/kerala`.
  - Crawler counts on /insights: the 13 GPTBot requests on 24 Oct 2026 were
    the deploy check's own (pages, llms.txt, robots), not OpenAI. Live checks
    since then use a plain user agent such as `TenderTezCheck/1.0`, which
    isn't counted, because server HTML is the same for every visitor. A
    crawler request shows a page was fetched, not that it was indexed.
- **Markdown versions and AI discovery files (Oct 2026):**
  - Every public page has a markdown version: `/pricing.md`, `/index.md`,
    `/api/md/<path>`, or `/pricing` sent with `Accept: text/markdown`.
  - `/llms.txt`, `/llms-full.txt` (cached 24 h in memory, the 10 largest
    tender lists) and `/ai.txt` are built from code (`src/seo.js`,
    `src/md/`); `/api/md/_catalog` lists every markdown page as JSON.
  - Check after a deploy: `curl -sI https://tendertez.in/pricing.md` (200,
    `text/markdown`, `X-Robots-Tag: noindex, follow`) and
    `curl -sI https://tendertez.in/pricing` (still HTML, with a
    `Link: …rel="describedby"` header).
  - A new public page: add its renderer in `src/md/registry.js`;
    `test/md.test.js` fails until it is there or skipped with a reason.
- **Fast tender counts (Oct 2026):**
  - Migration 0013 adds `public_tenders_facets_idx` and vacuums
    `public_tenders` after 2% of rows change.
  - After applying it, run `VACUUM (ANALYZE) public_tenders` once (read-mostly
    maintenance; it doesn't block reads or writes).
  - If the counts slow down again, check
    `select relallvisible, relpages from pg_class where relname = 'public_tenders'`.
    Below about 90% visible, the planner leaves the index; a manual VACUUM
    restores it.
- **Applying a migration from inside the app server** (works with the app's
  own deploy token): after deploying the code that contains it, run in
  `fly ssh console`, from `/app/backend`, drizzle-orm's migrator
  (`migrate(drizzle(pool), { migrationsFolder: './drizzle' })`) with the
  server's own `DATABASE_URL`. First check that
  `drizzle.__drizzle_migrations` already lists every earlier migration.
- **Sign-in with Google and with a WhatsApp code** are each off until
  configured (the buttons stay hidden). Set the values as Fly secrets in the
  Fly dashboard (app `tenderlytic-api` → Secrets), so no secret passes
  through chat:
  - **Google:**
    1. In Google Cloud Console create a project, set up the OAuth consent
       screen (External; app name TenderTez; authorised domain
       `tendertez.in`; privacy policy `https://tendertez.in/privacy-policy`;
       scopes openid, email and profile) and publish it.
    2. Create an OAuth client ID of type "Web application" with the
       redirect URI `https://tendertez.in/bidpilot/auth/google/callback`.
    3. Set `BIDPILOT_GOOGLE_CLIENT_ID` and `BIDPILOT_GOOGLE_CLIENT_SECRET`.
  - **WhatsApp (Meta Cloud API):**
    1. Create a Meta Business account and an app with the WhatsApp product,
       and add and verify a business phone number.
    2. Create an approved message template in category **Authentication**,
       named `tendertez_login_code`, language English, with a copy-code
       button.
    3. Create a permanent system-user token with
       `whatsapp_business_messaging`, and add a payment method (each code
       message is charged by Meta).
    4. Set `BIDPILOT_WHATSAPP_TOKEN` and `BIDPILOT_WHATSAPP_PHONE_NUMBER_ID`
       (and `BIDPILOT_WHATSAPP_OTP_TEMPLATE` if the template has another
       name). A failed send is logged as `whatsapp otp: send to … failed`
       with Meta's reason.
- **No company form at sign-up (since 26 Oct 2026):** a new user lands on
  the dashboard; the app creates their company, named after them (or "My
  company" with no name), and they rename it on the company profile page.
  The funnel in `visits-report.mjs` counts a new account by the `/signed-up`
  visit the app records then (before 26 Oct: `/onboarding/create-company`,
  which now redirects to the dashboard).
- **Company profile, optional for the first 3 tenders:** a company can
  upload and analyse its first 3 tenders (by upload time) without a profile.
  After that, uploads and analyses of later tenders are refused (409
  `profile_incomplete`) until every profile field is answered, and the app
  shows a "Complete your company profile" dialog. The number is
  `FREE_TENDERS_WITHOUT_PROFILE` in `backend/src/bidpilot/profileGate.js`
  and `frontend/src/shell/profileGate.ts` (a test keeps them equal).
- **Tender feed collector:** on while the Fly secret
  `BIDPILOT_DISCOVERY_CPPP=on` is set (switched on 15 Oct 2026). It reads
  CPPP's public central, state and GeM lists one page at a time:
  - `BIDPILOT_DISCOVERY_DELAY_SECONDS` (default 3, minimum 2) between pages;
  - `BIDPILOT_DISCOVERY_INTERVAL_MINUTES` (default 10, minimum 5): how often
    the newest pages of the central and state lists are re-read;
  - `BIDPILOT_DISCOVERY_LISTS` (default `central,state,gem`);
  - `BIDPILOT_DISCOVERY_KEEP_CLOSED_DAYS` (default 60, minimum 7).
  A full pass of all three lists is about 12,700 pages, roughly 14 hours;
  where each list is lives in the `discovery_state` table, so a deploy
  carries on. Logs: `metric bidpilot_discovery list=central page=200/2889`
  every 200 pages and at the end of each list, `pruned=N` when old tenders
  are deleted, and `bidpilot discovery: cppp read failed (...)` with the next
  try (it backs off from 1 minute to 30). Database size: about 1 KB per
  tender, so ~130,000 tenders is ~150 MB. Turn it off by removing the secret.
  GeM bids link to GeM's bid list (bidplus.gem.gov.in/all-bids) with the bid
  number copied; bidplus refuses connections from outside India, so GeM
  links can only be tested from an Indian network.
  If NIC replies to the access request (draft in Gmail to
  support-eproc@nic.in), follow their terms before anything else.
- **Corrigenda** use one AI call each against the company's daily analysis
  cap; they don't use the plan's tender allowance.
- **Subscriptions (monthly plans, until online payment exists):** when a
  firm has paid, run on the server, from `/app/backend`:
  `node scripts/subscription.mjs status` to find the company id, then
  `node scripts/subscription.mjs activate <companyId> STARTER|GROWTH|PRO`.
  Use `renew <companyId>` each month after payment (it starts when the
  current month ends) and `cancel <companyId>` to return the firm to the
  free trial. Use `UNLIMITED` only for internal accounts. Prices and limits
  live in `backend/src/bidpilot/plans.js` and must match
  `frontend/src/config/site.ts` (a test checks this).

**One-time setup** (from `whatsapp-doc-assistant/`):
```
fly launch --no-deploy          # creates the app; decline Fly's own Postgres
                                 # offer if using an external DB
fly volumes create tenderlytic_data --size 1
fly secrets set \
  DATABASE_URL=... \
  BIDPILOT_CSRF_SECRET=$(openssl rand -hex 32) \
  BIDPILOT_LOCAL_SIGNING_SECRET=$(openssl rand -hex 32) \
  AI_PROVIDER=openai OPENAI_API_KEY=... \
  BIDPILOT_CORS_ORIGINS=https://<your-lovable-app>.lovable.app
fly deploy
```
Every subsequent deploy is just `fly deploy`. `fly.toml`'s comments carry
the same instructions inline.

## The two things that silently break it

Both present the same way to a user — **no reply** — but have different causes
and fixes. Diagnose by sending `hi` and watching the logs at that moment.

### 1. Access token expired  ("I had to log in again")

- **Symptom:** replies stop; logs show a send failure / `190` / `401`, OR you
  recently re-logged into Meta and it started working.
- **Root cause:** a temporary/user access token that dies with your login.
- **Permanent fix:** use a **System User permanent token**:
  Business Settings → Users → System Users → assign the **App** + **WhatsApp
  Account** → *Generate token* → scopes `whatsapp_business_messaging` +
  `whatsapp_business_management` → **expiration: Never**. Put it in Render as
  `WHATSAPP_TOKEN`, redeploy.
- **Verify it's permanent:** paste the token into
  <https://developers.facebook.com/tools/debug/accesstoken> — **Expires** must
  read **Never**. A date there means it's still temporary and will die again.

### 2. Meta disabled the webhook  (nothing in logs when you send `hi`)

- **Symptom:** service is "live" (`/health` OK) but **no log line appears** when
  a message is sent — the webhook POST isn't arriving.
- **Root cause:** Meta auto-disables webhook delivery after repeated failed/
  timed-out deliveries (e.g. during crashes or deploy churn).
- **Fix:** Meta App Dashboard → **WhatsApp → Configuration**:
  1. Confirm **Callback URL** = `https://<your-app>.onrender.com/webhook`.
  2. Click **Verify and Save** (re-runs the GET handshake — the `/webhook` GET
     route answers it).
  3. Ensure the **`messages`** field is *Subscribed* (not just the top-level
     webhook).
  4. Confirm the **WABA is subscribed to the app** and **App Mode = Live**.
- Then send `hi` — you should get the greeting and a webhook log line.

## Quick incident table

| Symptom | Likely cause | Fix |
|---|---|---|
| No reply; logs show `190`/`401` on send | Token expired | Permanent System User token (§1) |
| No reply; **nothing** in logs on `hi` | Meta disabled webhook | Re-verify + re-subscribe (§2) |
| First message after idle is slow/dropped | Free-tier spin-down | `$7/mo` Render tier removes it |
| `npm start` appears after a big PDF | (Historical) OOM crash | Fixed — extraction + OCR now run in isolated child processes |
| "File too large" | >`MAX_PDF_MB` (20) | Expected; keep the limit unless on a bigger tier |

## Environment variables

Core (required):
- `WHATSAPP_TOKEN` — permanent System User token (see §1)
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
- `AI_PROVIDER` (`openai`), `OPENAI_API_KEY`, `AI_MODEL` (`gpt-5.6-terra`)

Guards / tuning (safe defaults in `.env.example`):
- `MAX_PDF_MB=20`, `MAX_PDF_PAGES=300`, `RATE_LIMIT_PER_MIN=20`
- OCR: `OCR_TIMEOUT_MS`, `OCR_MAX_HEAP_MB`, `MAX_OCR_PAGES`, `OCR_DPI`,
  `SCANNED_CHARS_PER_PAGE`, `OCR_LOW_CONFIDENCE_THRESHOLD`
- Extraction isolation: `EXTRACT_TIMEOUT_MS`, `EXTRACT_MAX_HEAP_MB`
- Metrics: `METRICS_HASH_SALT` (optional — enables pseudonymous per-user counts)

## Beta analytics — reading the logs

Every request logs content-free `metric …` lines (no document text, no phone
numbers). Grep them from the Render logs:

```
grep "metric action="                     # conversion mix (what people use)
grep "metric ingest" | grep "complex=true" # how often complex layouts appear
grep "metric convert action=excel"         # Excel hit vs. no-table fallback
grep "metric error"                        # failure rate + kind
grep -o "user=[0-9a-f]*" | sort -u | wc -l # distinct users (needs METRICS_HASH_SALT)
```

Fields: `metric ingest pages= bytes= ms= columns= complex= crossCol= ocr= [user=]`.

**One-screen digest.** Instead of grepping, pipe a log dump through the digest —
it prints cohort size, the complex-layout rate (the Engine-B signal), OCR rate,
action mix, conversion outcomes, and errors:

```
# From a file downloaded via Render → Logs → ⋯ → Download:
npm run digest -- render.log

# Or straight off a paste / live source:
cat render.log | npm run digest
```

Number setup and the SMB-vs-Cloud-API trap (new-number onboarding, stale
Phone Number IDs, the send-error cheat sheet) live in **`WHATSAPP_SETUP.md`**.

## Reliability status (what's already hardened)

- OCR and digital extraction both run in **isolated, heap-capped, killable
  child processes** — a pathological PDF dies in the child, never the server.
- pdf.js pinned to a patched version (RCE-class advisory), `isEvalSupported:
  false`, untrusted PDFs parsed only in the child sandbox.
- Complex multi-column layouts are **detected and the user is warned**, rather
  than silently producing scrambled output.
