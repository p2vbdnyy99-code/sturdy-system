// Tender activity feed — status changes, notes, deadline reminders. Distinct
// from audit_logs (audit.js): this is the human-facing "what's happened on
// this tender" timeline a user reads in the UI; audit_logs is the
// security/compliance trail. They overlap in content but serve different
// readers and different retention/access rules, so they stay separate tables.

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { users } from './identity.js';

export const tenderEvents = pgTable('tender_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),

  eventType: text('event_type').notNull(), // e.g. 'status_changed', 'note_added'
  description: text('description'),
  metadata: jsonb('metadata'),

  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_events_tender_idx').on(t.tenderId),
]);
