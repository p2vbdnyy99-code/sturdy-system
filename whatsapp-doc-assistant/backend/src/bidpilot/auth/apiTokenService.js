// API access token lifecycle: create, verify, destroy (Milestone 6).
// -----------------------------------------------------------------------------
// Deliberately mirrors sessionService.js's shape rather than sharing code
// with it — the two have genuinely different semantics (sessions slide via a
// throttled lastSeenAt touch; API tokens are flat/short and never slide), and
// unifying two call sites behind a generic "token store" would trade a small
// amount of duplication for a worse abstraction. The raw token is generated
// here and returned ONLY to the caller — the database row never holds it,
// only hashToken(raw), same discipline as sessions.

import { eq, and, gt } from 'drizzle-orm';
import { config } from '../../config.js';
import { apiAccessTokens } from '../../db/schema/index.js';
import { generateToken, hashToken } from './tokens.js';

/** Create a short-lived API token for `userId`. Returns { rawToken, token }
 *  — the raw token is what's returned in the login response body; it is
 *  never stored. */
export async function createApiToken(db, userId, { userAgent } = {}) {
  const rawToken = generateToken();
  const [token] = await db
    .insert(apiAccessTokens)
    .values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + config.bidpilot.apiTokenTtlMs),
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
    })
    .returning();
  return { rawToken, token };
}

/** Look up an API token by its RAW value. Returns undefined if missing,
 *  expired, or hashed-mismatch (indistinguishable, same reasoning as
 *  sessionService.js's getSessionByToken). No idle-touch — a 20-minute
 *  credential doesn't need a sliding clock, just a flat expiry. */
export async function getApiTokenByToken(db, rawToken) {
  if (!rawToken) return undefined;
  const tokenHash = hashToken(rawToken);
  const [token] = await db
    .select()
    .from(apiAccessTokens)
    .where(and(eq(apiAccessTokens.tokenHash, tokenHash), gt(apiAccessTokens.expiresAt, new Date())))
    .limit(1);
  return token;
}

/** Revoke: delete the token row. No-op (not an error) if it's already gone
 *  or already expired — same "logging out twice is not a failure" reasoning
 *  as destroySessionByToken. */
export async function destroyApiToken(db, rawToken) {
  if (!rawToken) return;
  await db.delete(apiAccessTokens).where(eq(apiAccessTokens.tokenHash, hashToken(rawToken)));
}
