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
import { config, warnOnMissingConfig } from './src/config.js';
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
    model: config.ai.model,
    hasAiKey: Boolean(config.ai.apiKey),
    hasWhatsAppToken: Boolean(config.whatsapp.token),
  });
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
    log.info(`  model: ${config.ai.model} · data dir: ${config.server.dataDir}`);
  });
}

start().catch((err) => {
  log.error('Failed to start:', err);
  process.exit(1);
});
