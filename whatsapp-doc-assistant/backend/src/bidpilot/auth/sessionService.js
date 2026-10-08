// Session lifecycle: create, verify+touch, destroy.
// -----------------------------------------------------------------------------
// The raw token is generated here and returned ONLY to the caller (which sets
// it in the cookie) — the database row never holds it, only hashToken(raw).

import { eq, and, gt } from 'drizzle-orm';
import { config } from '../../config.js';
import { sessions } from '../../db/schema/index.js';
import { generateToken, hashToken } from './tokens.js';

/** Create a session for `userId`. Returns { rawToken, session } — the raw
 *  token is what goes in the cookie; it is never stored. */
export async function createSession(db, userId, { userAgent } = {}) {
  const rawToken = generateToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + config.bidpilot.sessionTtlMs),
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
    })
    .returning();
  return { rawToken, session };
}

/**
 * Look up a session by its RAW cookie token. Returns undefined if missing,
 * expired, or hashed-mismatch (all three are indistinguishable to the
 * caller — never leak which). On a hit, opportunistically (throttled)
 * updates lastSeenAt so an active session's idle clock keeps sliding without
 * writing to the DB on every single request.
 */
export async function getSessionByToken(db, rawToken) {
  if (!rawToken) return undefined;
  const tokenHash = hashToken(rawToken);
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return undefined;

  const idleFor = Date.now() - session.lastSeenAt.getTime();
  if (idleFor > config.bidpilot.sessionTouchThresholdMs) {
    // Fire-and-forget-ish but awaited so callers relying on the return value
    // see the update in tests; failure to touch is not fatal to the request.
    try {
      await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
    } catch {
      // A failed touch doesn't invalidate an otherwise-valid session.
    }
  }
  return session;
}

/** Logout: delete the session row by its raw token. No-op (not an error) if
 *  it's already gone — logging out twice is not a failure. */
export async function destroySessionByToken(db, rawToken) {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
}
