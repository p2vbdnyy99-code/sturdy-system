# WhatsApp Document Assistant

Send a PDF to a WhatsApp number and get back a summary, answers to your
questions, an OCR transcription of a scan, a Word (`.docx`) conversion, extracted
tables, or a translation — all inside the chat, with no app to install.

This is **Phase 1 (MVP)** of the roadmap: a working WhatsApp bot backed by the
[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
and the Claude API.

```
User: 📎 Annual_Report.pdf
Bot:  📥 Got Annual_Report.pdf. Reading it now…
Bot:  ✅ Ready! I read Annual_Report.pdf (24 pages).
      [ Choose action ▾ ]
        📝 Summarize
        💬 Ask a question
        📄 Convert to Word
        📊 Extract tables
        🌐 Translate
        🧒 Explain simply
User: what were total revenues?
Bot:  💬 Thinking…
Bot:  Total revenues were ₹4.2 crore, up 18% year-on-year (see page 11)…
```

You can tap the menu **or** just type what you want ("make this a word doc",
"translate to Hindi", "explain page 3") — a Claude-powered intent router maps
natural language onto the right action.

## What it does

| Capability            | How                                                        |
| --------------------- | --------------------------------------------------------- |
| Summarize             | Claude, mobile-friendly bullet summary                    |
| Ask questions (chat)  | Claude, grounded in the document, with short-term memory  |
| OCR scanned PDFs      | Poppler (`pdftoppm`) + Tesseract, automatic when needed   |
| Convert to Word       | `docx` — editable `.docx` sent back into the chat         |
| Extract tables        | Claude, rendered as Markdown tables                       |
| Translate             | Claude, into any language you name                        |
| Explain simply        | Claude, "explain like I'm 10"                             |
| Natural-language menu | Claude intent routing, with an offline keyword fallback   |

## Architecture

```
whatsapp-doc-assistant/
└── backend/
    ├── server.js            Express webhook: GET verify + POST delivery, /health
    ├── src/
    │   ├── config.js        Env config, read once
    │   ├── logger.js        Timestamped console logger
    │   ├── whatsapp.js      Cloud API client: send/list/buttons/docs, media, HMAC
    │   ├── ai.js            Claude: summarize, ask, translate, ELI10, tables, intent
    │   ├── pdf.js           pdfjs-dist text layer + OCR fallback (pdftoppm+tesseract)
    │   ├── docx.js          Plain text → .docx
    │   ├── sessions.js      Per-user active document + Q&A memory (in-memory, TTL)
    │   ├── storage.js       Temp file storage on disk (TTL swept)
    │   └── router.js        Conversation logic: document → menu → actions
    ├── package.json
    └── .env.example
```

Design notes:

- **Webhooks ack instantly.** `POST /webhook` returns `200` immediately and
  processes the message off the request path — Meta retries slow webhooks.
- **Signatures are verified.** The `X-Hub-Signature-256` HMAC is checked against
  `WHATSAPP_APP_SECRET` in constant time (skipped only if the secret is unset,
  which the server warns about at boot).
- **One server-side key.** The Anthropic key never leaves the backend.
- **Graceful OCR.** Scans are detected by low text-per-page; if `pdftoppm` isn't
  installed, the bot says so instead of failing silently.
- **Prototype storage.** Sessions and files live in memory / local disk with a
  TTL. Swap for Redis + S3/Supabase and a database before shipping (see below).

## Setup

### 1. Prerequisites

- Node.js ≥ 20.
- For OCR of scanned PDFs: **poppler-utils** (`pdftoppm`) on the PATH.
  - Debian/Ubuntu: `sudo apt-get install poppler-utils`
  - macOS: `brew install poppler`
  - Tesseract's language data is downloaded automatically by `tesseract.js`.
  - Text-based PDFs work fine without any of this.

### 2. WhatsApp Cloud API

1. Create an app at <https://developers.facebook.com> and add the **WhatsApp**
   product.
2. From **API Setup**, copy the **temporary access token** and the
   **phone number ID** into `.env` (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
   Generate a permanent token via a System User before going live.
3. Copy the **App Secret** (App Settings → Basic) into `WHATSAPP_APP_SECRET`.
4. Invent a `WHATSAPP_VERIFY_TOKEN` string (any random value).

### 3. Run the backend

```bash
cd backend
npm install
cp .env.example .env          # fill in the values above + ANTHROPIC_API_KEY
npm start                     # http://localhost:8788
```

### 4. Point Meta at your webhook

Meta must reach your server over HTTPS. For local development, tunnel it:

```bash
npx localtunnel --port 8788   # or ngrok http 8788
```

In the Meta dashboard → **WhatsApp → Configuration → Webhook**:

- **Callback URL:** `https://<your-tunnel>/webhook`
- **Verify token:** the same `WHATSAPP_VERIFY_TOKEN` you set in `.env`
- Subscribe to the **messages** field.

Then message your test number a PDF.

## Endpoints

| Method | Path       | Purpose                                             |
| ------ | ---------- | --------------------------------------------------- |
| GET    | `/health`  | Liveness + whether keys/tokens are configured       |
| GET    | `/webhook` | Meta verification handshake (echoes `hub.challenge`)|
| POST   | `/webhook` | Inbound message delivery (signature-verified)       |

## Configuration

All configuration is via environment variables — see
[`backend/.env.example`](backend/.env.example) for the annotated list
(`WHATSAPP_*`, `ANTHROPIC_API_KEY`, `DEFAULT_MODEL`, `PORT`, `DATA_DIR`,
`MAX_PDF_MB`, `SESSION_TTL_MINUTES`).

## Roadmap

This MVP is deliberately scoped. Natural next steps, following the product plan:

- **Phase 2** — PDF → Excel, image extraction, voice replies, richer chat memory.
- **Phase 3** — accept Word/Excel/PowerPoint/images/audio/ZIP as input.
- **Phase 4** — premium flows: contract review, invoice parsing, resume analysis.
- **Phase 5** — accounts, team workspaces, Drive/OneDrive, freemium metering.

## Production checklist

The prototype takes shortcuts a real deployment shouldn't:

- Replace in-memory sessions with Redis (or a DB) so it scales past one instance.
- Replace local-disk storage with S3/Supabase and signed URLs.
- Add per-user rate limiting and a credit/quota system (freemium metering).
- Persist Q&A history and add auth/accounts.
- Add observability (structured logs, error tracking) and a retryable queue for
  the async processing path.

## Testing

You can test in three layers, from "no accounts" to "full round-trip."

### 1. The document pipeline, locally (no WhatsApp)

`backend/scripts/try.mjs` runs a real PDF through the same extraction, OCR, AI,
and `.docx` code the bot uses, printing to the terminal. A sample PDF is
included at [`samples/quarterly-review.pdf`](samples/quarterly-review.pdf).

```bash
cd backend
node scripts/try.mjs ../samples/quarterly-review.pdf extract      # no API key
node scripts/try.mjs ../samples/quarterly-review.pdf word          # no API key → .docx
# these need ANTHROPIC_API_KEY set (in .env or the environment):
node scripts/try.mjs ../samples/quarterly-review.pdf summarize
node scripts/try.mjs ../samples/quarterly-review.pdf ask "what were total revenues?"
node scripts/try.mjs ../samples/quarterly-review.pdf tables
node scripts/try.mjs ../samples/quarterly-review.pdf translate "Hindi"
```

### 2. The webhook, locally (no WhatsApp)

The webhook is plain HTTP. Verify liveness and the handshake with no keys:

```bash
npm start   # in one terminal
curl localhost:8788/health
curl "localhost:8788/webhook?hub.mode=subscribe&hub.verify_token=<YOUR_VERIFY_TOKEN>&hub.challenge=hello"
# → echoes "hello"
```

You can also POST a Cloud API message envelope to `/webhook` to drive the
router (leave `WHATSAPP_APP_SECRET` empty to skip the signature check in dev) —
though the bot's *replies* go out through the real Cloud API, so seeing them
requires credentials.

### 3. Full round-trip (real WhatsApp)

Complete the setup steps above (Cloud API creds + tunnel + webhook config), then
message a PDF to your test number and watch it reply. Use the WhatsApp Cloud API
**test number** and add your own phone as a recipient in the Meta dashboard while
developing — no charges, no business verification needed.

> **OCR note:** OCR only runs if `pdftoppm` (poppler-utils) is installed. Without
> it, text-based PDFs still work fine; scanned PDFs report that OCR is
> unavailable rather than failing silently.
