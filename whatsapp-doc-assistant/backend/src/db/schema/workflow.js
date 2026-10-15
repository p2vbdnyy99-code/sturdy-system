// Bid workflow (Oct 2026): the submission checklist and corrigenda.
// -----------------------------------------------------------------------------
// The checklist itself is built from the tender's extracted requirements at
// read time (repo/checklist.js), so it can never list something the tender
// doesn't ask for. Only the user's own state is stored here: a tick against a
// requirement (matched by a key of its text, so ticks survive a re-analysis
// that finds the same requirement) or an item the user added.

import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { users } from './identity.js';

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  // 'requirement' (a tick on an extracted requirement) or 'custom'.
  kind: text('kind').notNull(),
  // For 'requirement': a hash of the requirement's category and text.
  itemKey: text('item_key'),
  // For 'custom': what the user typed.
  label: text('label'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('checklist_items_tender_idx').on(t.tenderId),
  uniqueIndex('checklist_items_tender_key_idx').on(t.tenderId, t.itemKey),
]);

// A corrigendum (amendment) uploaded against an existing tender. Its text is
// compared with the tender's current facts; `changes` holds what differs,
// each with the page and quoted text from the corrigendum.
export const tenderCorrigenda = pgTable('tender_corrigenda', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  storageKey: text('storage_key').notNull(),
  pageCount: integer('page_count'),
  // 'PROCESSING' | 'COMPLETED' | 'FAILED'
  status: text('status').notNull().default('PROCESSING'),
  error: text('error'),
  // [{ field, label, before, after, sourcePage, evidenceText }]
  changes: jsonb('changes').$type(),
  summary: text('summary'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_corrigenda_tender_idx').on(t.tenderId),
]);
