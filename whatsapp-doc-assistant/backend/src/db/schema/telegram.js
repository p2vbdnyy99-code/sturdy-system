// Telegram identity linking. `userId` must ONLY ever be set by a verified
// linking flow (e.g. a one-time code the BidPilot user enters into the bot) —
// never trust a Telegram-supplied field as proof of which BidPilot account or
// company someone is. Deliberately no companyId column here: company access is
// always derived through userId -> company_members, never stored redundantly
// on this table, so there is no field here that could be spoofed to grant
// cross-company access. (Milestone 18 territory; this milestone ships only the
// table shape.)

import { pgTable, uuid, bigint, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity.js';

export const telegramUsers = pgTable('telegram_users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  telegramId: bigint('telegram_id', { mode: 'bigint' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  username: text('username'),
  firstName: text('first_name'),
  linkedAt: timestamp('linked_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('telegram_users_telegram_id_unique').on(t.telegramId),
]);
