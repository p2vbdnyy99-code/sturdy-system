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
import { config, warnOnMissingConfig, selectedApiKey } from './src/config.js';
import { log } from './src/logger.js';
import { verifyWebhook, verifySignature } from './src/whatsapp.js';
import { handleMessage } from './src/router.js';
import { ensureDataDir } from './src/storage.js';

const app = express();
app.disable('x-powered-by');

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

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    provider: config.ai.provider,
    model: config.ai.model,
    hasAiKey: Boolean(selectedApiKey(config.ai)),
    hasWhatsAppToken: Boolean(config.whatsapp.token),
  });
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
        const contact = contactsById.get(message.from);
        await handleMessage(message, contact);
      }
    }
  }
}

// ─── Fallbacks + start ───────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  log.error('unhandled:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  warnOnMissingConfig(log);
  await ensureDataDir();
  app.listen(config.server.port, () => {
    log.info(`WhatsApp Document Assistant listening on http://localhost:${config.server.port}`);
    log.info(
      `  AI: ${config.ai.provider} (${config.ai.model}) · data dir: ${config.server.dataDir}`,
    );
  });
}

start().catch((err) => {
  log.error('Failed to start:', err);
  process.exit(1);
});
