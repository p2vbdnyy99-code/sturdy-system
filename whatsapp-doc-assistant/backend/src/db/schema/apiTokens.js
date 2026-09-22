// Short-lived API access tokens (Milestone 6) — deliberately a SEPARATE table
// from `sessions`, not a shorter TTL on the same one.
// -----------------------------------------------------------------------------
// `sessions` does two jobs today: (1) the browser's 30-day login state, kept
// behind an HttpOnly cookie the JS on the page can never read, and (2) —
// before this table existed — the raw credential a cross-origin caller (e.g.
// a Lovable-built frontend) would use as a Bearer token, which necessarily
// means it's visible to that caller's own JS. Handing out a 30-day HttpOnly-
// cookie-grade credential in a form that's JS-readable by design was the
// actual security regression a review caught (see BIDPILOT_ARCHITECTURE.md's
// Milestone 6 section) — fixed by splitting the two jobs onto two tables with
// two different lifetimes, not by shortening the browser session itself.
//
// This table exists ONLY for the second job: a short (default 20-minute),
// non-sliding, independently revocable credential, issued only via an
// explicit opt-in on the existing authenticated login flow (never a second
// password/login system) and never returned unless asked for. No `lastSeenAt`
// (unlike sessions) — a token this short-lived doesn't need an idle clock,
// just a flat expiry.

import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';

export const apiAccessTokens = pgTable('api_access_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Same "store only the hash" discipline as sessions.token_hash — see
  // auth/tokens.js. A leaked database yields no usable credential.
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
}, (t) => [
  unique('api_access_tokens_token_hash_unique').on(t.tokenHash),
  index('api_access_tokens_user_idx').on(t.userId),
]);
