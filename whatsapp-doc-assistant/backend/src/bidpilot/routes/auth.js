// ⚠️  PLACEHOLDER IDENTITY — NOT AUTHENTICATION. ⚠️
// -----------------------------------------------------------------------------
// This milestone is about proving the ingestion pipeline and tenant isolation
// at the repository layer, NOT building a login system (that was explicitly
// named as scope to keep OUT of this milestone). But the upload endpoint still
// needs to know "which user is this" to enforce company ownership — so this
// middleware does the absolute minimum to make that provable:
//
//   1. Read a user id from a request header (BIDPILOT_IDENTITY_HEADER,
//      default `x-bidpilot-user-id`).
//   2. Confirm that id is a real row in `users`.
//   3. Attach it as req.bidpilotUserId.
//
// This is NOT secure. There is no password, no signature, no session, no
// expiry — anyone who can reach this server and knows (or guesses) a user's
// UUID can act as that user. It exists only so this milestone's tenant-scope
// enforcement (CompanyScope, requireCompanyAccess) has a real identity to test
// against, without pretending to have solved authentication.
//
// DO NOT expose these routes to real traffic until a real auth milestone
// (password/session/JWT — schema already has users.passwordHash for this)
// replaces this middleware. See BIDPILOT_ARCHITECTURE.md "unresolved
// decisions" in both milestone reports.

import { eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { getDb } from '../../db/client.js';
import { users } from '../../db/schema/index.js';

export function requireIdentity() {
  return async function identityMiddleware(req, res, next) {
    const userId = req.get(config.bidpilot.identityHeader);
    if (!userId) {
      return res.status(401).json({ error: `Missing ${config.bidpilot.identityHeader} header.` });
    }

    let db;
    try {
      db = getDb();
    } catch {
      return res.status(503).json({ error: 'BidPilot database is not configured.' });
    }

    let user;
    try {
      [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    } catch {
      // A malformed (non-uuid) header value throws at the DB layer — treat it
      // the same as "unknown user", never surface the DB error/stack trace.
      return res.status(401).json({ error: 'Unknown user.' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Unknown user.' });
    }
    req.bidpilotUserId = user.id;
    return next();
  };
}
