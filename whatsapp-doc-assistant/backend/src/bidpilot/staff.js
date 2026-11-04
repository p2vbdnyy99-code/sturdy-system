// The TenderTez team's own activity is left out of the site's visit counts
// and of Google Analytics, so the numbers show real visitors (Nov 2026).
// -----------------------------------------------------------------------------
// The team's accounts are config.bidpilot.adminEmails (BIDPILOT_ADMIN_EMAILS).
// A visit is not counted when either:
//   - the request carries a valid session of one of those accounts, or
//   - the browser has the staff marker cookie. GET /me sets it for those
//     accounts, so a browser stays excluded after signing out (founders look
//     at their own site signed out too). It holds no identity, only "1", and
//     an ordinary user never gets it. Someone who set it by hand would only
//     leave their own visits uncounted.
// The check reads the database without touching the session, so counting a
// visit never extends anyone's sign-in.

import { and, eq, gt } from 'drizzle-orm';
import { sessions, users } from '../db/schema/index.js';
import { hashToken } from './auth/tokens.js';
import { SESSION_COOKIE_NAME, cookiesSecure } from './auth/cookies.js';
import { isAdmin } from './insights.js';

export const STAFF_COOKIE_NAME = 'bidpilot_staff';
export const STAFF_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // browsers cap cookies at 400 days

export function staffCookieOptions() {
  return { httpOnly: true, secure: cookiesSecure, sameSite: 'lax', path: '/', maxAge: STAFF_COOKIE_MAX_AGE_MS };
}

export function hasStaffMarker(req) {
  return req.cookies?.[STAFF_COOKIE_NAME] === '1';
}

/** True when `rawToken` is a live session of a team account. Read-only. */
export async function isStaffSession(db, rawToken, adminEmails) {
  if (!rawToken || !(adminEmails || []).length) return false;
  const [row] = await db
    .select({ email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return Boolean(row) && isAdmin(row, adminEmails);
}

/** `(req) => Promise<boolean>`: whether this request comes from the team. Never throws. */
export function createStaffCheck({ db, adminEmails }) {
  return async (req) => {
    if (hasStaffMarker(req)) return true;
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return false;
    try {
      return await isStaffSession(db(), token, adminEmails);
    } catch {
      return false;
    }
  };
}
