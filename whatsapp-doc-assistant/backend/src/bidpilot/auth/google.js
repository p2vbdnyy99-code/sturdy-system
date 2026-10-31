// "Continue with Google": OAuth 2.0 authorization-code flow with PKCE, done
// entirely on the server. No Google script runs in the page (the strict CSP
// allows none); the browser only follows redirects.
//
// The ID token comes straight from Google's token endpoint over TLS in
// exchange for our client secret, so (per OpenID Connect) its claims are
// checked rather than its signature: issuer, audience, expiry, and that
// Google has verified the email.

import crypto from 'node:crypto';
import { config } from '../../config.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const OAUTH_COOKIE_NAME = 'bidpilot_oauth';
export const OAUTH_COOKIE_PATH = '/bidpilot/auth/google';

let fetchImpl = (...args) => fetch(...args);
/** Tests replace Google's token endpoint. */
export function setGoogleFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

export class GoogleSignInError extends Error {
  constructor(message) { super(message); this.name = 'GoogleSignInError'; }
}

export function googleEnabled() {
  return Boolean(config.bidpilot.google.clientId && config.bidpilot.google.clientSecret);
}

export function googleRedirectUri() {
  return `${config.bidpilot.localStorage.publicBaseUrl.replace(/\/+$/, '')}/bidpilot/auth/google/callback`;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** A new state + PKCE verifier, and the Google URL to send the browser to. */
export function startGoogleSignIn() {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const params = new URLSearchParams({
    client_id: config.bidpilot.google.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url: `${GOOGLE_AUTH_URL}?${params}`, cookieValue: `${state}.${verifier}` };
}

/** Constant-time check of the returned state against the cookie. Returns the
 *  PKCE verifier, or null if they don't match. */
export function checkState(cookieValue, returnedState) {
  const [state, verifier] = String(cookieValue || '').split('.');
  if (!state || !verifier || typeof returnedState !== 'string') return null;
  const a = Buffer.from(state); const b = Buffer.from(returnedState);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? verifier : null;
}

/** Exchange the code, check the ID token's claims, return the Google profile. */
export async function finishGoogleSignIn(code, verifier, now = Date.now()) {
  const { clientId, clientSecret } = config.bidpilot.google;
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code', code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) throw new GoogleSignInError(`token exchange failed (${res.status})`);
  const { id_token: idToken } = await res.json();
  const claims = decodeJwtPayload(idToken);
  if (!claims) throw new GoogleSignInError('no ID token');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new GoogleSignInError('wrong issuer');
  if (claims.aud !== clientId) throw new GoogleSignInError('wrong audience');
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) throw new GoogleSignInError('expired');
  if (!(claims.email_verified === true || claims.email_verified === 'true')) throw new GoogleSignInError('email not verified');
  if (!claims.sub || !claims.email) throw new GoogleSignInError('missing account id or email');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name ? String(claims.name) : null };
}

export function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}
