// Sign-in methods other than email + password.
//
// auth_identities: one row per external account linked to a user, e.g.
// ('google', <Google's stable "sub" id>). The subject, not the email, is what
// identifies a returning Google user, because a Google account's email can
// change.
//
// phone_otps: one-time codes for phone sign-in, delivered by WhatsApp. Only a
// hash of the code is stored. Rows are kept briefly for rate limiting (see
// bidpilot/auth/phoneOtp.js) and deleted after a day.

import { pgTable, uuid, text, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'google'
  subject: text('subject').notNull(),
  email: text('email'), // as the provider reported it at the last sign-in
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('auth_identities_provider_subject_unique').on(t.provider, t.subject),
  index('auth_identities_user_idx').on(t.userId),
]);

export const phoneOtps = pgTable('phone_otps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  phone: text('phone').notNull(), // E.164
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  requestIp: text('request_ip'), // for the per-IP send limit; deleted with the row after a day
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('phone_otps_phone_created_idx').on(t.phone, t.createdAt),
  index('phone_otps_ip_created_idx').on(t.requestIp, t.createdAt),
]);
