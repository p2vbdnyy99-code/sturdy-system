# WhatsApp Document Assistant

Send a PDF to a WhatsApp number and get back a summary, answers to your
questions, an OCR transcription of a scan, a Word (`.docx`) conversion, extracted
tables, or a translation — all inside the chat, with no app to install.

This is **Phase 1 (MVP)** of the roadmap: a working WhatsApp bot backed by the
[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
and a pluggable AI provider (**OpenAI** or **Anthropic** — selectable via
`AI_PROVIDER`).

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
"translate to Hindi", "explain page 3") — obvious commands are matched locally
(no LLM call); genuinely ambiguous messages fall through to the AI router.

## What it does

| Capability            | How                                                        |
| --------------------- | --------------------------------------------------------- |
| Summarize             | AI provider, mobile-friendly bullet summary               |
| Ask questions (chat)  | AI provider, grounded in the document, short-term memory  |
| OCR scanned PDFs      | Poppler (`pdftoppm`) + Tesseract, automatic when needed   |
| Convert to Word       | `docx` — editable `.docx` sent back into the chat         |
| Extract tables        | AI provider, rendered as Markdown tables                  |
| Translate             | AI provider, into any language you name                   |
| Explain simply        | AI provider, "explain like I'm 10"                        |
| Natural-language menu | Deterministic keyword rules first, AI only when ambiguous |

## Architecture

```
whatsapp-doc-assistant/
└── backend/
    ├── server.js            Express webhook: GET verify + POST delivery, /health
    ├── src/
    │   ├── config.js        Env config + provider selection, read once
    │   ├── logger.js        Timestamped console logger
    │   ├── whatsapp.js      Cloud API client: send/list/buttons/docs, media, HMAC
    │   ├── ai/              Provider-independent AI layer
    │   │   ├── index.js      Facade: summarize/ask/translate/explain/tables/intent
    │   │   ├── provider.js   Base contract: complete({system,user,maxTokens})
    │   │   ├── openai.js     OpenAI provider (Responses API)
    │   │   ├── anthropic.js  Anthropic provider (Messages API)
    │   │   └── errors.js     AIError codes + safe user messages
    │   ├── pdf.js           pdfjs-dist text layer + OCR fallback (pdftoppm+tesseract)
    │   ├── docx.js          Plain text → .docx
    │   ├── sessions.js      Per-user active document + Q&A memory (in-memory, TTL)
    │   ├── storage.js       Temp file storage on disk (TTL swept)
    │   └── router.js        Conversation logic: document → menu → actions
    ├── test/                node --test suite (config, provider routing, ops)
    ├── package.json
    └── .env.example
```

**Provider independence.** The app talks only to `src/ai/index.js`
(`summarize`, `answer`, `translate`, `explainSimply`, `extractTables`,
`classifyIntent`). That facade builds the prompts and delegates the raw call to
the selected provider — so the WhatsApp/router/PDF code never imports an AI SDK:

```
Application → AI facade (src/ai/index.js) → OpenAI | Anthropic
```

Only `src/ai/openai.js` imports the OpenAI SDK, and only `src/ai/anthropic.js`
imports the Anthropic SDK.

Design notes:

- **Webhooks ack instantly.** `POST /webhook` returns `200` immediately and
  processes the message off the request path — Meta retries slow webhooks.
- **Signatures are verified.** The `X-Hub-Signature-256` HMAC is checked against
  `WHATSAPP_APP_SECRET` in constant time (skipped only if the secret is unset,
  which the server warns about at boot).
- **One server-side key.** The provider API key never leaves the backend, and
  is never logged or sent to the user. AI failures map to short, safe messages.
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

Create the Meta app and collect your credentials — full step-by-step in
**[SETUP.md](SETUP.md)**. In short:

1. Create an app at <https://developers.facebook.com> and add the **WhatsApp**
   product.
2. From **API Setup**, copy the **temporary access token** and the
   **phone number ID** into `.env` (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
   Generate a permanent token via a System User before going live.
3. Copy the **App Secret** (App Settings → Basic) into `WHATSAPP_APP_SECRET`.
4. Invent a `WHATSAPP_VERIFY_TOKEN` string (any random value).
5. Allow-list your own phone number as a test recipient.

### 3. Choose an AI provider

Pick **one** provider and set only its key. An unsupported `AI_PROVIDER` fails
at startup — the app never silently falls back.

**OpenAI** (default):

```env
AI_PROVIDER=openai
AI_MODEL=gpt-5.6-terra    # optional; this is the default
OPENAI_API_KEY=sk-...
```

**Anthropic**:

```env
AI_PROVIDER=anthropic
AI_MODEL=claude-opus-5    # optional; this is the default
ANTHROPIC_API_KEY=sk-ant-...
```

Only the selected provider's key is required — OpenAI mode needs no Anthropic
key, and vice versa. `AI_MODEL` is optional and defaults per provider;
`AI_TIMEOUT_MS` (default 60000) bounds each AI call.

> Migration from earlier versions: the old single `DEFAULT_MODEL` /
> `ANTHROPIC_API_KEY`-only setup now needs `AI_PROVIDER=anthropic` set
> explicitly (the default is now `openai`). `DEFAULT_MODEL` is still accepted as
> an alias for `AI_MODEL`.

### 4. Run the backend

```bash
cd backend
npm install
cp .env.example .env          # fill in WhatsApp values + AI_PROVIDER + its key
npm start                     # http://localhost:8788
npm test                      # optional: run the test suite
```

### 5. Point Meta at your webhook

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
(`WHATSAPP_*`, `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`,
`AI_TIMEOUT_MS`, `PORT`, `DATA_DIR`, `MAX_PDF_MB`, `SESSION_TTL_MINUTES`).

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
# these need the selected provider's key set (OPENAI_API_KEY or ANTHROPIC_API_KEY):
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

### 3. Automated tests (no API calls)

```bash
cd backend
npm test        # node --test
```

Covers configuration/provider selection (openai, anthropic, unsupported,
missing key), provider routing, and the document operations with a **mocked**
provider — including that obvious commands route without an LLM call. No real
OpenAI/Anthropic/WhatsApp calls are made.

### 4. Full round-trip (real WhatsApp)

Complete the setup steps above (Cloud API creds + tunnel + webhook config), then
message a PDF to your test number and watch it reply. Use the WhatsApp Cloud API
**test number** and add your own phone as a recipient in the Meta dashboard while
developing — no charges, no business verification needed.

> **OCR note:** OCR only runs if `pdftoppm` (poppler-utils) is installed. Without
> it, text-based PDFs still work fine; scanned PDFs report that OCR is
> unavailable rather than failing silently.
