// WhatsApp Document Assistant — webhook server.
// -----------------------------------------------------------------------------
// Exposes the two endpoints Meta's WhatsApp Cloud API needs:
//   GET  /webhook  — verification handshake (echoes hub.challenge)
//   POST /webhook  — inbound message delivery
// plus GET /health for liveness checks.
//
// Inbound messages are acknowledged with 200 immediately and processed
// asynchronously, because Meta retries webhooks that don't return quickly.

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, warnOnMissingConfig } from './src/config.js';
import { log } from './src/logger.js';
import { verifyWebhook, verifySignature } from './src/whatsapp.js';
import { handleMessage } from './src/router.js';
import { ensureDataDir } from './src/storage.js';
import { isDuplicate } from './src/dedupe.js';
import { allow } from './src/ratelimit.js';
import { createTendersRouter } from './src/bidpilot/routes/tenders.js';
import { createDownloadRouter } from './src/bidpilot/routes/download.js';
import { createAuthRouter } from './src/bidpilot/routes/auth.js';
import { createDashboardRouter } from './src/bidpilot/routes/dashboard.js';
import { createCompaniesRouter } from './src/bidpilot/routes/companies.js';
import { cookieParserMiddleware } from './src/bidpilot/auth/cookies.js';
import { bidpilotCors } from './src/bidpilot/auth/cors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sibling of backend/, not inside it — verified against the actual
// filesystem before writing this (whatsapp-doc-assistant/{backend,frontend}/),
// not assumed from a diagram. Doesn't exist on a Papyr-only deployment that
// never ran `npm run build` (see the frontendDistExists guard below) or on
// a checkout that predates Milestone 5b.
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
const frontendDistExists = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

const app = express();
app.disable('x-powered-by');
// Render terminates TLS at its edge and proxies plain HTTP to this process —
// without this, Express can't tell a request arrived over HTTPS, which
// silently breaks Secure-cookie behavior (auth/cookies.js). Harmless for
// Papyr's WhatsApp routes, which don't use cookies at all.
app.set('trust proxy', 1);

// Strict CSP for the Tenderlytic frontend — this product handles
// commercially sensitive tender documents, so no third-party script/style/
// font/analytics origins are allowlisted. Harmless on Papyr's JSON-only
// webhook responses (a CSP header on a non-HTML response is simply ignored
// by the browser). script-src/style-src deliberately omit 'unsafe-inline':
// the frontend has no inline <script> and uses plain CSS classes rather
// than React style={{}} props specifically so this can stay strict — see
// frontend/src/index.css's header comment.
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
});

// Capture the raw body so we can verify the X-Hub-Signature-256 HMAC. Express
// still parses JSON into req.body as usual.
app.use(
  express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ─── Health ──────────────────────────────────────────────────────────────────

// Minimal public liveness check — intentionally free of internal config
// (provider/model/key presence) to avoid fingerprinting the deployment.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ─── Privacy policy ──────────────────────────────────────────────────────────
// Meta requires a reachable HTML privacy-policy URL before an app can go Live.
// This serves a minimal, honest policy page for the assistant.

app.get('/privacy', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy — WhatsApp Document Assistant</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto;
           padding: 0 20px; line-height: 1.6; color: #222; }
    h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.6em; }
    footer { margin-top: 2em; color: #666; font-size: .9rem; }
  </style>
</head>
<body>
  <h1>Privacy Policy — WhatsApp Document Assistant</h1>
  <p>This service lets a user send documents to a WhatsApp number and receive
     AI-generated summaries, answers, translations, and file conversions.</p>

  <h2>What we process</h2>
  <p>When you message the assistant, we process the message content and any
     document you send solely to produce the response you requested.</p>

  <h2>How it is used</h2>
  <p>Document text is sent to our AI provider to generate your result, and the
     result is sent back to you on WhatsApp. We do not sell your data or use it
     for advertising.</p>

  <h2>Retention</h2>
  <p>Documents and conversation context are held only transiently to fulfil your
     request and are removed automatically after a short period.</p>

  <h2>Contact</h2>
  <p>For any privacy question or a data-deletion request, contact the operator of
     this assistant.</p>

  <footer>This is a personal/prototype deployment of an open-source assistant.</footer>
</body>
</html>`);
});

// ─── Webhook verification (GET) ──────────────────────────────────────────────

app.get('/webhook', (req, res) => {
  const challenge = verifyWebhook(req.query);
  if (challenge !== null) {
    log.info('Webhook verified by Meta.');
    return res.status(200).send(challenge);
  }
  log.warn('Webhook verification failed (bad verify token).');
  return res.sendStatus(403);
});

// ─── Webhook delivery (POST) ─────────────────────────────────────────────────

app.post('/webhook', (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) {
    log.warn('Rejected webhook with invalid signature.');
    return res.sendStatus(401);
  }

  // Acknowledge immediately; do the real work off the request path.
  res.sendStatus(200);
  setImmediate(() => processWebhook(req.body).catch((err) => log.error('processWebhook:', err)));
});

/** Walk the webhook payload and dispatch each inbound message. */
async function processWebhook(body) {
  if (body?.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      // Status updates (delivered/read receipts) arrive here too — ignore them.
      if (!value.messages) continue;

      const contactsById = new Map(
        (value.contacts || []).map((c) => [c.wa_id, c]),
      );

      for (const message of value.messages) {
        // Replay/duplicate protection: Meta delivers at-least-once, and a signed
        // request could be replayed. Skip anything we've already processed.
        if (isDuplicate(message.id)) {
          log.debug('Skipping duplicate webhook message.');
          continue;
        }
        // Per-sender abuse/cost guard.
        if (!allow(message.from)) {
          log.warn('Rate limit exceeded for a sender; dropping message.');
          continue;
        }
        const contact = contactsById.get(message.from);
        await handleMessage(message, contact);
      }
    }
  }
}

// ─── BidPilot (separate product, same engine) ───────────────────────────────
// Entirely independent of the WhatsApp webhook above — no shared routes,
// middleware, or state with Papyr's message handling. See
// whatsapp-doc-assistant/BIDPILOT_ARCHITECTURE.md.
//
// Mounted only when DATABASE_URL is configured; otherwise these routes 503
// cleanly rather than the server failing to boot. A Papyr-only deployment
// (no DATABASE_URL) is completely unaffected either way.
if (config.db.url) {
  app.use('/bidpilot', bidpilotCors());
  app.use('/bidpilot', cookieParserMiddleware);
  app.use('/bidpilot', createAuthRouter());
  app.use('/bidpilot', createCompaniesRouter());
  app.use('/bidpilot', createDashboardRouter());
  app.use('/bidpilot', createTendersRouter());
  app.use('/bidpilot', createDownloadRouter());
} else {
  app.use('/bidpilot', (_req, res) => {
    res.status(503).json({ error: 'BidPilot is not configured on this deployment.' });
  });
}

// ─── Tenderlytic frontend (Milestone 5b) ────────────────────────────────────
// Same-origin static serving — see BIDPILOT_ARCHITECTURE.md's Milestone 5b
// entry for why (SameSite=Lax cookies would never reach a separately-hosted
// frontend). Registered AFTER every API route above, so nothing here can
// ever shadow /webhook, /health, /privacy, or /bidpilot/*.
if (frontendDistExists) {
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback: Express 5 (path-to-regexp 8) rejects a bare '*' route
  // pattern ("Missing parameter name") — verified against the actual
  // installed version before writing this, not assumed from Express 4
  // habits. A path-less app.use() (already this file's own 404-handler
  // idiom, below) sidesteps path-to-regexp entirely, so it's used here too.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Never intercept a BidPilot API path — an unmatched /bidpilot/* route
    // must fall through to the JSON 404 below, not silently return HTML.
    if (req.path.startsWith('/bidpilot')) return next();
    // A path with a file extension that express.static didn't already
    // serve is a genuinely missing asset (e.g. a stale hashed bundle
    // reference) — 404 it honestly rather than masking the problem as HTML.
    if (/\.[^/]+$/.test(req.path)) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ─── Fallbacks + start ───────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  log.error('unhandled:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Keep the free-tier host awake: ping our own public /health on an interval
// shorter than the platform's idle spin-down window (~15 min on Render). The
// public URL comes from KEEPALIVE_URL, or RENDER_EXTERNAL_URL which Render sets
// automatically. No-op locally where neither is present.
function startKeepAlive() {
  const url = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!url) return;
  const everyMs = 10 * 60 * 1000;
  const ping = () =>
    fetch(`${url}/health`)
      .then(() => log.debug('keep-alive ping ok'))
      .catch((err) => log.debug('keep-alive ping failed:', err.message));
  const timer = setInterval(ping, everyMs);
  timer.unref?.();
  log.info(`Keep-alive enabled: pinging ${url}/health every 10 min.`);
}

async function start() {
  warnOnMissingConfig(log);
  await ensureDataDir();
  app.listen(config.server.port, () => {
    log.info(`WhatsApp Document Assistant listening on http://localhost:${config.server.port}`);
    log.info(
      `  AI: ${config.ai.provider} (${config.ai.model}) · data dir: ${config.server.dataDir}`,
    );
  });
  startKeepAlive();
}

// Exported so tests can exercise the real, fully-wired app (route ordering,
// CSP, static/SPA-fallback logic) without also binding a port or touching
// the data dir — see test/spa-fallback.test.js. Only auto-starts when this
// file is the actual entrypoint (`node server.js` / `npm start`), the
// standard Node ESM "is this the main module" check.
export { app };

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    log.error('Failed to start:', err);
    process.exit(1);
  });
}
