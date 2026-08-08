# Papyr — Operations Runbook

How Papyr runs in production and how to recover when it breaks. Written from
real incidents during beta.

## Architecture (one line)

WhatsApp Cloud API (Meta) → webhook → **Node/Express server on Render** →
pdf.js / Tesseract / docx / exceljs → reply on WhatsApp. No document is ever
written to disk.

## Deploy

- Code lives on branch `claude/whatsapp-ai-document-assistant-*`; Render builds
  from the connected repo and runs `npm start` (`backend/`).
- Pushing new commits triggers a Render deploy. **Avoid pushing several commits
  in quick succession** — overlapping deploys create a window where messages
  sent mid-rollover are dropped (seen in beta). Push, let one deploy finish,
  then test.

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

## Reliability status (what's already hardened)

- OCR and digital extraction both run in **isolated, heap-capped, killable
  child processes** — a pathological PDF dies in the child, never the server.
- pdf.js pinned to a patched version (RCE-class advisory), `isEvalSupported:
  false`, untrusted PDFs parsed only in the child sandbox.
- Complex multi-column layouts are **detected and the user is warned**, rather
  than silently producing scrambled output.
