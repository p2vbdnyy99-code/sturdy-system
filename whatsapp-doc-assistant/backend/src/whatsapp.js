// WhatsApp Cloud API client.
// -----------------------------------------------------------------------------
// Thin wrappers over the Graph API endpoints we use: sending text / interactive
// menus / documents, uploading and downloading media, marking messages read, and
// verifying the webhook handshake + payload signature.
//
// Uses Node's global `fetch`, `FormData`, and `Blob` (Node >= 20), so there are
// no HTTP-client dependencies.

import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './logger.js';

const { graphBase, phoneNumberId, token, verifyToken, appSecret } = config.whatsapp;

const authHeaders = () => ({ Authorization: `Bearer ${token}` });

/** POST a message payload to the Cloud API `/messages` endpoint. */
async function sendMessage(payload) {
  const res = await fetch(`${graphBase}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// ─── Webhook verification ────────────────────────────────────────────────────

/**
 * Handle the GET verification handshake. Returns the challenge string to echo
 * back when the token matches, or `null` when it does not.
 */
export function verifyWebhook(query) {
  const mode = query['hub.mode'];
  const challenge = query['hub.challenge'];
  const providedToken = query['hub.verify_token'];
  if (mode === 'subscribe' && providedToken === verifyToken) {
    return challenge;
  }
  return null;
}

/**
 * Verify the `X-Hub-Signature-256` header against the raw request body using the
 * app secret. Returns `true` when verification passes OR when no app secret is
 * configured (dev mode). Uses a constant-time comparison.
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!appSecret) return true; // dev only — warned about at startup
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export function sendText(to, body) {
  return sendMessage({
    to,
    type: 'text',
    text: { body: truncateForWhatsApp(body), preview_url: false },
  });
}

/**
 * Send interactive reply buttons (max 3). `buttons` is an array of
 * `{ id, title }` — titles are capped at 20 chars by WhatsApp.
 */
export function sendButtons(to, body, buttons) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: truncateForWhatsApp(body, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Send an interactive list menu (up to 10 rows across sections). Each row is
 * `{ id, title, description }`. Good for menus that don't fit in 3 buttons.
 */
export function sendList(to, { body, buttonLabel = 'Choose', rows, header }) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: header.slice(0, 60) } } : {}),
      body: { text: truncateForWhatsApp(body, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: (r.description || '').slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

/** Send a previously-uploaded document by media id, with an optional caption. */
export function sendDocument(to, { mediaId, filename, caption }) {
  return sendMessage({
    to,
    type: 'document',
    document: { id: mediaId, filename, ...(caption ? { caption } : {}) },
  });
}

/** Best-effort read receipt so the user sees the blue ticks while we work. */
export async function markRead(messageId) {
  try {
    await sendMessage({ status: 'read', message_id: messageId });
  } catch (err) {
    log.debug('markRead failed (non-fatal):', err.message);
  }
}

// ─── Media: download & upload ────────────────────────────────────────────────

/**
 * Download an inbound media object. Two steps: resolve the media id to a
 * short-lived URL, then fetch the bytes (that fetch must also carry the token).
 * Returns `{ buffer, mimeType }`.
 */
export async function downloadMedia(mediaId) {
  const metaRes = await fetch(`${graphBase}/${mediaId}`, { headers: authHeaders() });
  if (!metaRes.ok) {
    throw new Error(`Media lookup failed (${metaRes.status})`);
  }
  const meta = await metaRes.json();

  const binRes = await fetch(meta.url, { headers: authHeaders() });
  if (!binRes.ok) {
    throw new Error(`Media download failed (${binRes.status})`);
  }
  const buffer = Buffer.from(await binRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type || 'application/octet-stream' };
}

/**
 * Upload a generated file to the Cloud API and return its media id, which can
 * then be sent with {@link sendDocument}.
 */
export async function uploadMedia(buffer, mimeType, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const res = await fetch(`${graphBase}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Media upload failed (${res.status}): ${detail}`);
  }
  const data = await res.json();
  return data.id;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// WhatsApp text bodies are capped at 4096 chars. Trim gracefully with a marker
// so long AI output never triggers a hard API rejection.
export function truncateForWhatsApp(text, limit = 4096) {
  const s = String(text ?? '');
  if (s.length <= limit) return s;
  const marker = '\n\n…(truncated — reply "more" or ask for a Word file)';
  return s.slice(0, limit - marker.length) + marker;
}
