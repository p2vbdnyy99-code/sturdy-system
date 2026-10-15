// Saved searches and their alerts (Oct 2026). A company saves a tender-feed
// search (kind, state, organisation, words); tenders the collector first sees
// after that become matches, shown in the app until someone opens them.
// Delivered in the app only for now; an email digest can later read the
// same unseen matches.

import { pgTable, uuid, text, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, companies } from './identity.js';
import { publicTenders } from './publicTenders.js';

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // { kind, state, organisation, search }: the same filters as the search.
  filters: jsonb('filters').$type().notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('saved_searches_company_idx').on(t.companyId),
]);

export const savedSearchMatches = pgTable('saved_search_matches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  savedSearchId: uuid('saved_search_id').notNull().references(() => savedSearches.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  publicTenderId: uuid('public_tender_id').notNull().references(() => publicTenders.id, { onDelete: 'cascade' }),
  seenAt: timestamp('seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('saved_search_matches_unique').on(t.savedSearchId, t.publicTenderId),
  index('saved_search_matches_company_seen_idx').on(t.companyId, t.seenAt),
]);
