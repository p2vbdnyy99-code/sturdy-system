# AI Copilot — Prototype

A browser-extension AI copilot with a small backend proxy. The extension gives
any web page a Notion-style assistant: a floating chat, a selection toolbar,
a command palette, a page sidebar, and smart form fill. The backend proxies to
the Claude API, handling authentication and a credit-metering system so the API
key never reaches the client.

```
ai-copilot-prototype/
├── backend/                 Express proxy (JWT auth + AI proxy + credits)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── extension/               Chrome MV3 extension
    ├── manifest.json
    ├── background.js        Service worker: token, retry logic, SSE bridge
    ├── contentScript.js     Orchestrator
    ├── styles.css           Dark/light Notion-style UI
    ├── popup.html/.js       Sign in / credits
    ├── options.html/.js     Settings
    ├── utils/               storage, apiClient, prompts
    ├── components/          floatingButton, textToolbar, chatBox,
    │                        sidebar, commandPalette, formFill
    └── icons/               16 / 48 / 128 PNG icons
```

## Backend

```bash
cd backend
npm install
cp .env.example .env          # then set ANTHROPIC_API_KEY and JWT_SECRET
npm start                     # http://localhost:8787
```

Endpoints:

| Method | Path                 | Purpose                                  |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/api/health`        | Liveness + whether an API key is present |
| POST   | `/api/auth/register` | Create account, returns JWT + credits    |
| POST   | `/api/auth/login`    | Authenticate, returns JWT                |
| GET    | `/api/auth/me`       | Current user + credit balance            |
| GET    | `/api/credits`       | Credit balance                           |
| POST   | `/api/ai/complete`   | Buffered completion (charges credits)    |
| POST   | `/api/ai/stream`     | Streaming completion via SSE             |

Credits are granted at signup (`SIGNUP_CREDITS`) and metered against real token
usage on every call. State is in memory by default; set `DATA_FILE` to persist
it to JSON across restarts. Swap the store for a real database before shipping.

## Extension

1. Start the backend.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select the `extension/` folder.
3. Click the toolbar icon and **register** an account (it talks to the backend).
4. On any page you now get:
   - a draggable **floating button** → opens the chat panel
   - a **selection toolbar** with quick actions when you highlight text
   - a **command palette** (`Ctrl/Cmd+Shift+K`)
   - a **sidebar** (`Ctrl/Cmd+Shift+U`) to summarize the page
   - **✦ form fill** buttons on text inputs

Configure the backend URL, theme, model override, and toggles in the extension's
**Settings** page.

## Notes

This is a prototype. Before production, replace the in-memory user store with a
database, tighten CORS to your extension's origin, add refresh tokens, and audit
the credit accounting against your billing model.
