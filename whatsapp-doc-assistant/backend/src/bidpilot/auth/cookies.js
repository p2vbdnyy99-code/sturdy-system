// Cookie parsing + the session/CSRF cookie option builders.
// -----------------------------------------------------------------------------
// Uses the `cookie` package directly (already present as Express's own
// internal dependency for res.cookie() — added here as an explicit direct
// dependency for stability) rather than pulling in `cookie-parser`, which
// would add a whole middleware package for what `cookie.parse()` already does
// in one line.

import cookie from 'cookie';

export const SESSION_COOKIE_NAME = 'bidpilot_session';
export const CSRF_COOKIE_NAME = 'bidpilot_csrf';

/** Express middleware: parses the Cookie header into req.cookies (a plain
 *  object), matching the shape `cookie-parser` would have provided — nothing
 *  downstream needs to know this isn't that package. */
export function cookieParserMiddleware(req, _res, next) {
  req.cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  next();
}

/** True when cookies should carry the Secure flag. Mirrors server.js's own
 *  existing Render-detection pattern (RENDER_EXTERNAL_URL) rather than a bare
 *  NODE_ENV check, so local dev over plain HTTP (where a Secure cookie would
 *  never be sent back by the browser at all) isn't accidentally broken. An
 *  explicit override is available for edge cases (e.g. a non-Render host that
 *  still terminates TLS upstream). */
export function cookiesShouldBeSecure(env = process.env) {
  if (env.BIDPILOT_COOKIE_SECURE !== undefined) return env.BIDPILOT_COOKIE_SECURE === 'true';
  return Boolean(env.RENDER_EXTERNAL_URL) || env.NODE_ENV === 'production';
}

const SECURE = cookiesShouldBeSecure();

export function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    // res.cookie's maxAge option is itself in ms (Express divides by 1000
    // when it builds the Set-Cookie Max-Age attribute) — pass maxAgeMs
    // straight through. A prior version divided by 1000 here too, which
    // made Express divide twice: a 30-day TTL was actually set as ~43
    // minutes in production. See routes/auth.js for the (ms) call site.
    maxAge: maxAgeMs,
  };
}

/** The CSRF cookie must be READABLE by JS (the frontend echoes it back as a
 *  header) — this is the one cookie in the app that is deliberately NOT
 *  HttpOnly. It is not a secret on its own (see csrf.js's docblock on why a
 *  signed double-submit token doesn't need to be). */
export function csrfCookieOptions(maxAgeMs) {
  return {
    httpOnly: false,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs, // see sessionCookieOptions()'s comment above
  };
}

// Re-exported so callers can log/inspect the resolved value without
// recomputing it.
export const cookiesSecure = SECURE;
