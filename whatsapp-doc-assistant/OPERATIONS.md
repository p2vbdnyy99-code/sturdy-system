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
