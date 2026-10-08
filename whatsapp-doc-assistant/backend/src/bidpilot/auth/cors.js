// CORS for cross-origin API consumers (e.g. a Lovable-built frontend) —
// deliberately separate from the existing same-origin cookie-based frontend,
// which needs no CORS handling at all (same-origin requests are never
// subject to it). This only ever allows origins explicitly listed in
// BIDPILOT_CORS_ORIGINS; empty/unset means no cross-origin requests are
// permitted, and the existing frontend is completely unaffected either way.
//
// Deliberately NEVER sets Access-Control-Allow-Credentials: a cross-origin
// caller is expected to authenticate via `Authorization: Bearer <token>`
// (see routes/auth.js's short-lived API access token), not cookies — so
// there is no need (and real extra risk) in allowing this origin to
// send/receive this app's cookies at all.

import { config } from '../../config.js';

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, x-csrf-token';

/** `origins` defaults to the configured allowlist; a test can pass its own
 *  explicit array instead of mutating the shared config singleton (same
 *  injection-over-global-state approach as ai/index.js's setProvider()). */
export function bidpilotCors(origins = config.bidpilot.corsOrigins) {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  };
}
