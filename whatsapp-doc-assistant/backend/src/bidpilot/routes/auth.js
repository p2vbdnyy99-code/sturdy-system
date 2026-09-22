// Real authentication (Milestone 3) — replaces the earlier placeholder
// identity-header middleware entirely. Registration, login, logout, email
// verification, and the session-verifying middleware every other BidPilot
// route depends on.
//
// AUTHENTICATION vs AUTHORIZATION, kept structurally separate (per the
// design brief): this file answers ONLY "who is making this request" and
// sets req.bidpilotUserId. It never resolves or caches a companyId — that is
// exclusively CompanyScope's job (repo/tenants.js), resolved fresh on every
// request. A session identifies a user, not a company, so a user belonging
// to multiple companies never needs to re-login to act on a different one.
//
// No transactional email provider is wired up this milestone (deliberately —
// see devDeliverVerificationLink below). Local/dev verification works via a
// logged link; production email delivery is a later, deliberate addition.

import express from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { config } from '../../config.js';
import { companyMembers, companies } from '../../db/schema/index.js';
import { registerUser, verifyEmail, findUserByEmail, findUserById, RegistrationError } from '../repo/users.js';
import { verifyPassword } from '../auth/passwordHash.js';
import { createSession, getSessionByToken, destroySessionByToken } from '../auth/sessionService.js';
import { createApiToken, getApiTokenByToken, destroyApiToken } from '../auth/apiTokenService.js';
import { allowLoginAttempt, clearLoginAttempts } from '../auth/loginRateLimit.js';
import { csrfTokenFor, requireCsrf } from '../auth/csrf.js';
import {
  SESSION_COOKIE_NAME, CSRF_COOKIE_NAME,
  sessionCookieOptions, csrfCookieOptions,
} from '../auth/cookies.js';

// ─── The real session-verifying middleware ──────────────────────────────────

/** Every protected BidPilot route depends on this. Sets req.bidpilotUserId
 *  and (for a cookie-authenticated request) req.bidpilotSession, needed by
 *  requireCsrf downstream.
 *
 *  Accepts EITHER of two, deliberately DIFFERENT, credentials:
 *  - the existing bidpilot_session cookie (same-origin frontend, unchanged —
 *    a 30-day, HttpOnly, sliding-idle session; see sessionService.js)
 *  - an `Authorization: Bearer <token>` header carrying a SEPARATE, short-
 *    lived API access token (api_access_tokens/apiTokenService.js — default
 *    20 minutes, never sliding, independently revocable) — for a cross-
 *    origin caller such as a Lovable-built frontend (see auth/cors.js).
 *
 *  These are NOT the same credential presented two ways (an earlier design
 *  did that and was rejected in review — see BIDPILOT_ARCHITECTURE.md's
 *  Milestone 6 section — because it meant the 30-day HttpOnly session token
 *  ended up readable by cross-origin JavaScript). The 30-day session token
 *  is NEVER returned in any JSON response, only ever set as an HttpOnly
 *  cookie, exactly as before this milestone. req.bidpilotAuthMethod records
 *  which credential authenticated this request ('cookie' | 'apiToken') so
 *  requireCsrf() (cookie-specific protection — see csrf.js's docblock on
 *  why) and logout (below) know which store to act on. */
export function requireSession() {
  return async (req, res, next) => {
    let db;
    try {
      db = getDb();
    } catch {
      return res.status(503).json({ error: 'BidPilot database is not configured.' });
    }

    const bearerMatch = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    let userId, rawToken, authMethod, session;

    if (bearerMatch) {
      authMethod = 'apiToken';
      rawToken = bearerMatch[1];
      const token = await getApiTokenByToken(db, rawToken);
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated.' });
      }
      userId = token.userId;
    } else {
      authMethod = 'cookie';
      rawToken = req.cookies?.[SESSION_COOKIE_NAME];
      session = await getSessionByToken(db, rawToken);
      if (!session) {
        return res.status(401).json({ error: 'Not authenticated.' });
      }
      userId = session.userId;
    }

    const user = await findUserById(db, userId);
    if (!user || user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account is not active.' });
    }

    req.bidpilotUserId = user.id;
    req.bidpilotSession = session; // only set for authMethod === 'cookie'
    req.bidpilotUser = user;
    req.bidpilotRawToken = rawToken;
    req.bidpilotAuthMethod = authMethod;
    return next();
  };
}

// ─── Dev-mode verification link "delivery" ──────────────────────────────────

/** No email provider is configured this milestone. In dev, the link is
 *  logged so a developer can click/copy it; nothing is sent anywhere. This is
 *  a deliberate placeholder — see BIDPILOT_ARCHITECTURE.md "Milestone 3" for
 *  why production email delivery is a separate, later decision rather than
 *  quietly wiring in a provider now. */
function devDeliverVerificationLink(email, rawToken) {
  const base = config.bidpilot.localStorage.publicBaseUrl;
  const url = `${base}/bidpilot/verify-email?token=${encodeURIComponent(rawToken)}`;
  log.info(`[DEV] Email verification link for ${email} (no email provider configured): ${url}`);
  return url;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createAuthRouter() {
  const router = express.Router();
  router.use(express.json());

  router.post('/register', async (req, res) => {
    try {
      const db = getDb();
      const { email, password, name } = req.body || {};
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email is required.' });
      }
      const { user, rawVerificationToken } = await registerUser(db, { email, password, name });
      const devLink = devDeliverVerificationLink(user.email, rawVerificationToken);

      const body = { userId: user.id, email: user.email, status: user.status };
      // The dev verification link is ONLY ever included in a non-production
      // response — never something a real deployment should echo back.
      if (!config.bidpilot.csrfSecret || process.env.NODE_ENV !== 'production') {
        body.devVerificationUrl = devLink;
      }
      return res.status(201).json(body);
    } catch (err) {
      if (err instanceof RegistrationError) {
        return res.status(err.code === 'email_taken' ? 409 : 400).json({ error: err.message });
      }
      log.error('bidpilot register error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.get('/verify-email', async (req, res) => {
    try {
      const db = getDb();
      const user = await verifyEmail(db, req.query.token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification link.' });
      }
      return res.json({ verified: true, email: user.email });
    } catch (err) {
      log.error('bidpilot verify-email error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const db = getDb();
      const { email, password, issueApiToken } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      const rateKey = String(email).toLowerCase();
      if (!allowLoginAttempt(rateKey)) {
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      }

      const user = await findUserByEmail(db, email);
      // Deliberately generic failure for "no such user" AND "wrong password"
      // AND "suspended" — never reveal which, so a login form can't be used
      // to enumerate registered emails.
      const invalid = () => res.status(401).json({ error: 'Invalid email or password.' });
      if (!user || !user.passwordHash) return invalid();
      if (user.status === 'SUSPENDED') return invalid();
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) return invalid();

      clearLoginAttempts(rateKey);
      // The 30-day session is created for EVERY login, unconditionally —
      // this is the existing M3 browser-session flow, byte-identical to
      // before Milestone 6. Its raw token is NEVER put in the response body,
      // only ever the HttpOnly cookie below.
      const { rawToken, session } = await createSession(db, user.id, { userAgent: req.get('user-agent') });

      res.cookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(config.bidpilot.sessionTtlMs));
      res.cookie(CSRF_COOKIE_NAME, csrfTokenFor(session.tokenHash), csrfCookieOptions(config.bidpilot.sessionTtlMs));

      const body = {
        userId: user.id,
        email: user.email,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
      };

      // A SEPARATE, short-lived, independently-revocable credential — minted
      // ONLY on explicit opt-in (not a second login system; this still runs
      // after the same password check above), never the normal response
      // shape a browser login gets. For a cross-origin caller (e.g. a
      // Lovable-built frontend) that has no usable way to receive the
      // HttpOnly cookie above anyway. See auth/apiTokenService.js.
      if (issueApiToken === true) {
        const { rawToken: apiToken, token } = await createApiToken(db, user.id, { userAgent: req.get('user-agent') });
        body.apiToken = apiToken;
        body.apiTokenExpiresAt = token.expiresAt;
      }

      return res.json(body);
    } catch (err) {
      log.error('bidpilot login error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.post('/logout', requireSession(), requireCsrf(), async (req, res) => {
    try {
      const db = getDb();
      // Destroy whichever credential actually authenticated this request —
      // an apiToken-authenticated logout must revoke ITS OWN token, not the
      // (possibly nonexistent, in a cross-origin call) session cookie; a
      // cookie-authenticated logout behaves exactly as before Milestone 6.
      if (req.bidpilotAuthMethod === 'apiToken') {
        await destroyApiToken(db, req.bidpilotRawToken);
      } else {
        await destroySessionByToken(db, req.bidpilotRawToken);
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
      return res.json({ loggedOut: true });
    } catch (err) {
      log.error('bidpilot logout error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.get('/me', requireSession(), async (req, res) => {
    try {
      const db = getDb();
      const memberships = await db
        .select({ companyId: companyMembers.companyId, role: companyMembers.role, name: companies.name })
        .from(companyMembers)
        .innerJoin(companies, eq(companies.id, companyMembers.companyId))
        .where(eq(companyMembers.userId, req.bidpilotUserId));

      return res.json({
        userId: req.bidpilotUser.id,
        email: req.bidpilotUser.email,
        status: req.bidpilotUser.status,
        emailVerified: Boolean(req.bidpilotUser.emailVerifiedAt),
        companies: memberships,
      });
    } catch (err) {
      log.error('bidpilot /me error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
