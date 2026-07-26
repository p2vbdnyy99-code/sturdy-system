// Per-user session state (in memory).
// -----------------------------------------------------------------------------
// Keyed by the sender's WhatsApp id (their phone number). Holds the most recent
// document a user sent — its extracted text, original file path, and Q&A history
// — plus any pending follow-up (e.g. "waiting for the language to translate to").
//
// State lives in memory and is swept on a TTL. For multi-instance deployments,
// back this with Redis or a database before shipping.

import { config } from './config.js';
import { log } from './logger.js';

/** @type {Map<string, any>} */
const sessions = new Map();

const TTL = config.server.sessionTtlMs;

export function getSession(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL) {
    sessions.delete(userId);
    return null;
  }
  return s;
}

/** Store (or replace) the user's active document and reset conversation state. */
export function setDocument(userId, { text, filename, filePath, ocrUsed }) {
  sessions.set(userId, {
    userId,
    doc: { text, filename, filePath, ocrUsed },
    history: [],
    pending: null,
    updatedAt: Date.now(),
  });
}

/** Record a question/answer pair so follow-ups have short-term memory. */
export function addQa(userId, q, a) {
  const s = getSession(userId);
  if (!s) return;
  s.history.push({ q, a });
  if (s.history.length > 10) s.history.shift();
  s.updatedAt = Date.now();
}

/** Set a pending follow-up, e.g. { type: 'awaiting_question' }. */
export function setPending(userId, pending) {
  const s = getSession(userId);
  if (!s) return;
  s.pending = pending;
  s.updatedAt = Date.now();
}

export function clearPending(userId) {
  setPending(userId, null);
}

// Periodically evict expired sessions so memory doesn't grow unbounded.
const sweep = setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > TTL) {
      sessions.delete(id);
      removed += 1;
    }
  }
  if (removed) log.debug(`Swept ${removed} expired session(s)`);
}, 5 * 60 * 1000);
sweep.unref?.();
