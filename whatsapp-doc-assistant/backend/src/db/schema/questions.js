// Tender-specific Q&A history (Milestone 9's RAG feature writes here later;
// this milestone only ships the table it will need). Kept for auditability —
// "what did we tell this user, and did we cite a source" should be reviewable.

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { users } from './identity.js';

export const tenderQuestions = pgTable('tender_questions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  question: text('question').notNull(),
  answer: text('answer'),
  // Array of page numbers the answer cited — mirrors the "never answer without
  // a source page, or say you couldn't find it" rule from the product spec.
  sourcePages: jsonb('source_pages').$type().default(sql`'[]'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_questions_tender_idx').on(t.tenderId),
]);
