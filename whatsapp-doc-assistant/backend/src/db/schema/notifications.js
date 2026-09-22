import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, companies } from './identity.js';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Nullable: set for company-wide notices (e.g. "usage limit approaching");
  // null for purely personal ones.
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // e.g. 'tender_analysis_complete', 'deadline_approaching'
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata'),
  readAt: timestamp('read_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('notifications_user_read_idx').on(t.userId, t.readAt),
]);
