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

// Senders we've greeted at least once, so the branded welcome fires only on a
// user's FIRST message. In-memory: it resets on restart, so a returning user
// may be welcomed again after a deploy — acceptable for beta, and it keeps us
// from persisting any user identifier to disk.
const seenSenders = new Set();

/** True the first time we see a sender (and records them). False thereafter. */
export function firstTouch(userId) {
  if (seenSenders.has(userId)) return false;
  seenSenders.add(userId);
  return true;
}

// Feedback capture must work for ANY sender, even one with no active document,
// so it can't live on the document session. Tiny TTL-bounded map: after a user
// types "feedback", we remember to treat their NEXT message as the note.
const feedbackWaiting = new Map(); // userId -> timestamp set
const FEEDBACK_PENDING_TTL = 10 * 60 * 1000; // 10 min to actually type it

/** Mark that we asked this sender for feedback and expect their next message. */
export function setFeedbackPending(userId) {
  feedbackWaiting.set(userId, Date.now());
}

/** True (and clears the flag) if this sender was asked for feedback and hasn't
 *  timed out; false otherwise. One-shot: capture their next message, then reset. */
export function takeFeedbackPending(userId) {
  const t = feedbackWaiting.get(userId);
  if (t === undefined) return false;
  feedbackWaiting.delete(userId);
  return Date.now() - t <= FEEDBACK_PENDING_TTL;
}

export function getSession(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL) {
    sessions.delete(userId);
    return null;
  }
  return s;
}

/** Store (or replace) the user's active document and reset conversation state.
 *  spanPages carries the structured geometry the Word/Excel converters need;
 *  it MUST be persisted — dropping it silently forces every conversion down the
 *  flat-text fallback (that regression is what test/sessions.test.js guards). */
export function setDocument(userId, { text, filename, filePath, spanPages, ocrUsed, layout }) {
  sessions.set(userId, {
    userId,
    doc: { text, filename, filePath, spanPages, ocrUsed, layout },
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
  // Also drop feedback prompts the user never answered.
  for (const [id, t] of feedbackWaiting) {
    if (now - t > FEEDBACK_PENDING_TTL) feedbackWaiting.delete(id);
  }
  if (removed) log.debug(`Swept ${removed} expired session(s)`);
}, 5 * 60 * 1000);
sweep.unref?.();
