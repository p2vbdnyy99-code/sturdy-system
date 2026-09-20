// CSRF protection — signed double-submit cookie, no server-side storage.
// -----------------------------------------------------------------------------
// Token = HMAC-SHA256(secret, session's tokenHash). Set in a JS-readable
// cookie (see cookies.js — the ONE cookie in the app that isn't HttpOnly) on
// login; the frontend echoes it back as an `x-csrf-token` header on every
// state-changing request. Verification recomputes the same HMAC from the
// caller's authenticated session and compares — no CSRF-specific row to
// persist, rotate, or garbage-collect.
//
// Safe without being a secret in the cookie itself: the value proves nothing
// on its own (it's derived from a session id an attacker doesn't have), it
// only proves "whoever set this header can also read this origin's cookies" —
// which a cross-site attacker's forged request cannot do. That's the entire
// point of the double-submit pattern.
//
// SameSite=Lax on both cookies already blocks most cross-site vectors for a
// same-origin app; this is the belt-and-suspenders layer OWASP recommends on
// top of it for state-changing requests from a cookie-authenticated app.

import crypto from 'node:crypto';
import { config } from '../../config.js';

export function csrfTokenFor(sessionTokenHash) {
  if (!config.bidpilot.csrfSecret) {
    // Fail loudly rather than silently HMAC with an empty key — an unset
    // secret must never quietly produce a guessable/reproducible token.
    throw new Error('BIDPILOT_CSRF_SECRET is not set.');
  }
  return crypto
    .createHmac('sha256', config.bidpilot.csrfSecret)
    .update(sessionTokenHash)
    .digest('hex');
}

export function verifyCsrfToken(sessionTokenHash, providedToken) {
  if (!providedToken || typeof providedToken !== 'string') return false;
  const expected = csrfTokenFor(sessionTokenHash);
  const a = Buffer.from(expected);
  const b = Buffer.from(providedToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Express middleware: require a valid x-csrf-token header on state-changing
 *  methods for a cookie-authenticated request. Call AFTER session
 *  verification (req.bidpilotSession must already be set). GET/HEAD/OPTIONS
 *  are exempt (never state-changing, and this is what lets a plain link/tab
 *  open work without a token). */
export function requireCsrf() {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const provided = req.get('x-csrf-token');
    if (!req.bidpilotSession || !verifyCsrfToken(req.bidpilotSession.tokenHash, provided)) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    }
    return next();
  };
}
