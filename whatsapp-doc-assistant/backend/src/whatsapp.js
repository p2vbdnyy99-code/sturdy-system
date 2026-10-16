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
 * Pure signature check: does `signatureHeader` (`sha256=<hex>`) match an HMAC of
 * `rawBody` under `secret`? When `secret` is empty this returns `true` (dev-only
 * bypass). A missing body or malformed header returns `false` — never throws.
 * Uses a constant-time comparison. Exported so it can be unit-tested directly.
 */
export function signaturesMatch(rawBody, signatureHeader, secret) {
  if (!secret) return true; // dev only — warned about at startup
  if (!rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  let expected;
  try {
    expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  } catch {
    return false;
  }
  const provided = signatureHeader.slice('sha256='.length);

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify the `X-Hub-Signature-256` header on an incoming webhook against the
 * configured app secret. Delegates to {@link signaturesMatch}.
 */
export function verifySignature(rawBody, signatureHeader) {
  return signaturesMatch(rawBody, signatureHeader, appSecret);
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

// A media id from the webhook is interpolated into a Graph API URL path, so it
// must be a plain id — never characters that could alter the request path/query.
const MEDIA_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Is `id` a syntactically valid WhatsApp media id (safe to put in a URL path)? */
export function isValidMediaId(id) {
  return typeof id === 'string' && MEDIA_ID_RE.test(id);
}

// The download URL is returned by Meta's authenticated API and fetched WITH our
// bearer token — so we only ever send that token to a Meta-owned host.
const ALLOWED_MEDIA_HOST_SUFFIXES = [
  '.fbsbx.com',
  '.fbcdn.net',
  '.facebook.com',
  '.whatsapp.net',
  '.cdninstagram.com',
];

/** Is `url` an https Meta-owned media host we may send the access token to? */
export function isAllowedMediaUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_MEDIA_HOST_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

/** Raised when the media exceeds the allowed size (caller shows a friendly note). */
export class MediaTooLargeError extends Error {
  constructor(size, limit) {
    super('media too large');
    this.name = 'MediaTooLargeError';
    this.code = 'MEDIA_TOO_LARGE';
    this.size = size;
    this.limit = limit;
  }
}

/**
 * Download an inbound media object. Two steps: resolve the media id to a
 * short-lived URL, then fetch the bytes (that fetch must also carry the token).
 * Hardened: validates the id, rejects oversized media BEFORE downloading via the
 * metadata `file_size`, only sends the token to Meta-owned hosts, and enforces
 * the byte cap again after download. Returns `{ buffer, mimeType }`.
 */
export async function downloadMedia(mediaId, { maxBytes = Infinity } = {}) {
  if (!isValidMediaId(mediaId)) {
    throw new Error('Invalid media id');
  }

  const metaRes = await fetch(`${graphBase}/${encodeURIComponent(mediaId)}`, {
    headers: authHeaders(),
  });
  if (!metaRes.ok) {
    throw new Error(`Media lookup failed (${metaRes.status})`);
  }
  const meta = await metaRes.json();

  const declaredSize = Number(meta.file_size);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new MediaTooLargeError(declaredSize, maxBytes);
  }
  if (!isAllowedMediaUrl(meta.url)) {
    throw new Error('Media URL host not allowed');
  }

  const binRes = await fetch(meta.url, { headers: authHeaders() });
  if (!binRes.ok) {
    throw new Error(`Media download failed (${binRes.status})`);
  }
  const buffer = Buffer.from(await binRes.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new MediaTooLargeError(buffer.length, maxBytes);
  }
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
