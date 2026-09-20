// Server-side sessions (Milestone 3). The raw session token is NEVER stored —
// only its SHA-256 hash. If the database were ever compromised, the attacker
// gets a table of hashes, not usable browser credentials (the raw token only
// ever exists in the HttpOnly cookie and transiently in server memory during
// a request). See src/bidpilot/auth/tokens.js and sessionService.js.
//
// Deliberately does NOT carry a companyId. A session identifies a USER, never
// a company — authorization is resolved fresh on every request via
// company_members/CompanyScope (Milestone 1), never cached onto the session.
// This is what lets a user belong to more than one company without a
// re-login when switching between them.

import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Absolute lifetime cap — a session past this is dead regardless of activity.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Sliding idle indicator, throttled on write (see sessionService.js) so
  // touching it doesn't mean a DB write on every single request.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  // Forensic value for a future "your active sessions" UI — kept minimal
  // deliberately (no IP address stored, to limit the PII footprint of a
  // table that exists purely for login bookkeeping).
  userAgent: text('user_agent'),
}, (t) => [
  unique('sessions_token_hash_unique').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId),
]);
