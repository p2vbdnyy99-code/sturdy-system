# Setup guide — WhatsApp Cloud API

A step-by-step for creating the Meta app and wiring it to this backend. It's
**free** — no business verification or payment is needed while you're testing on
the Cloud API test number.

Each credential you collect maps to a variable in `backend/.env` (copy it from
[`backend/.env.example`](backend/.env.example)).

## Prerequisites

- A **Facebook account** (personal is fine).
- A **Meta Business account** — you'll be prompted to create one during setup if
  you don't have one. No documents required for test mode.

## 1. Create the app

1. Go to <https://developers.facebook.com> and log in.
2. First time only: click **Get Started** and accept the developer terms.
3. **My Apps** (top right) → **Create App**.
4. **Use case:** pick **Other** → **Next**.
   - ⚠️ Do **not** pick an AI-related use case (anything labelled *AI*, *Llama*,
     *Meta AI*, or *Model API*). Those activate Meta's Llama "Model API", which
     is region-restricted (e.g. not available in India) and is **not needed** —
     this project calls your own AI provider (OpenAI or Anthropic) from your
     server, never Meta's model API.
     If a *"The Model API isn't available in your region"* popup appears, tap
     **OK**, back out, and choose **Other**.
5. **App type:** choose **Business** → **Next**.
6. Give it a name (e.g. "Doc Assistant"), enter a contact email, select your
   Business account → **Create App** (it may ask for your password).

## 2. Add the WhatsApp product

1. On the app dashboard, scroll to **Add products to your app**.
2. Find **WhatsApp** → **Set up**.
3. Meta creates a **test business account** and a **test phone number**
   automatically — that test number is what your bot sends and receives from.

## 3. Collect your credentials

From **WhatsApp → API Setup** (left sidebar):

| On the screen                                              | `.env` variable            |
| --------------------------------------------------------- | -------------------------- |
| **Temporary access token** ("Generate access token")      | `WHATSAPP_TOKEN`           |
| **Phone number ID** (under *From* — not the number itself)| `WHATSAPP_PHONE_NUMBER_ID` |

From **App settings → Basic** (left sidebar):

| On the screen                | `.env` variable        |
| ---------------------------- | ---------------------- |
| **App Secret** (click *Show*)| `WHATSAPP_APP_SECRET`  |

And one you invent yourself — any random string:

| You choose it                                    | `.env` variable          |
| ------------------------------------------------ | ------------------------ |
| e.g. `openssl rand -hex 16`                      | `WHATSAPP_VERIFY_TOKEN`  |

### AI provider key

Pick one AI provider and set only its key (the app is provider-independent —
see the README for details). Set `AI_PROVIDER` to match.

| Provider  | `.env`                                                           | Get the key from                          |
| --------- | ---------------------------------------------------------------- | ----------------------------------------- |
| OpenAI    | `AI_PROVIDER=openai` + `OPENAI_API_KEY`                          | <https://platform.openai.com/api-keys>    |
| Anthropic | `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`                    | <https://platform.claude.com>             |

Only the selected provider's key is required. `AI_MODEL` is optional (defaults:
OpenAI `gpt-5.6-terra`, Anthropic `claude-opus-5`).

## 4. Allow-list your own phone

Still on **API Setup**, under **To** → **Manage phone number list**, add your
personal WhatsApp number and confirm the code Meta sends you. In test mode the
bot can only message numbers on this allow-list (up to 5).

> **Test number ≠ your WhatsApp.** The bot lives on Meta's test number. You
> message *it* from your own phone (the one you just allow-listed).

## 5. Start the backend and expose it

Meta must reach your server over HTTPS, so tunnel your local port:

```bash
cd backend
npm install
cp .env.example .env      # fill in the values from steps 3–4
npm start                 # http://localhost:8788

# in another terminal:
npx localtunnel --port 8788    # or: ngrok http 8788
```

Note the public `https://…` URL the tunnel prints.

## 6. Register the webhook

In the Meta dashboard → **WhatsApp → Configuration → Webhook → Edit**:

- **Callback URL:** `https://<your-tunnel>/webhook`
- **Verify token:** the same `WHATSAPP_VERIFY_TOKEN` you put in `.env`
- Click **Verify and save**. Meta sends a GET handshake; this server answers it
  (you'll see `Webhook verified by Meta.` in the logs).
- Then **Manage** → subscribe to the **messages** field.

## 7. Test it

Message the sample PDF ([`samples/quarterly-review.pdf`](samples/quarterly-review.pdf))
to the test number from your allow-listed phone. The bot should reply with the
action menu.

## Going beyond test mode

- **Temporary tokens expire in ~24 hours.** For something that stays up, create
  a permanent token: **Business Settings → Users → System Users → Add**, assign
  your app, and generate a token with the `whatsapp_business_messaging` and
  `whatsapp_business_management` permissions. Put it in `WHATSAPP_TOKEN`.
- **Messaging numbers you haven't allow-listed** (i.e. real customers) requires
  registering your own business phone number and completing Meta's business
  verification. Not needed for development.

## Troubleshooting

| Symptom                                     | Likely cause / fix                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Webhook "Verify and save" fails             | `WHATSAPP_VERIFY_TOKEN` mismatch, server not running, or tunnel URL wrong/expired |
| Bot never replies                           | Your phone isn't on the allow-list, or you didn't subscribe to the **messages** field |
| `401` on incoming webhooks in the logs      | `WHATSAPP_APP_SECRET` is wrong (signature check fails)                           |
| Replies fail with a 190 / token error       | Temporary access token expired — regenerate it (or switch to a permanent token) |
| Scanned PDFs say OCR is unavailable         | Install `poppler-utils` (`pdftoppm`); text-based PDFs work without it            |
| *"The Model API isn't available in your region"* during app creation | You selected an AI use case. That's Meta's region-locked Llama API — not needed here. Tap **OK**, back out, and pick **Other** → **Business**, then add the **WhatsApp** product |
