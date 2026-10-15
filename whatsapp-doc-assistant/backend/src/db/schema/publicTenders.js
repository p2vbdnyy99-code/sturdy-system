// The tender feed (Oct 2026): tenders seen on the public lists of the
// Central Public Procurement Portal (bidpilot/discovery/), shared by every
// company because they are public notices. Three lists: central government
// tenders, state tenders (the "MMP" list, with the state's name) and GeM
// bids. Only basic metadata is kept; documents are never downloaded.
// Central and state rows have no link of their own (the portal's links only
// work inside the session that loaded the list), so `tender_id` is what a
// user searches for on the portal.

import { pgTable, uuid, text, timestamp, integer, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const publicTenders = pgTable('public_tenders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  source: text('source').notNull(), // 'cppp'
  sourceKey: text('source_key').notNull(), // the portal's own reference / tender id
  kind: text('kind').notNull().default('central'), // 'central' | 'state' | 'gem'
  title: text('title').notNull(),
  reference: text('reference'),
  tenderId: text('tender_id'), // e.g. 2026_NTPC_112765_1 or GEM/2026/B/7978179
  organisation: text('organisation'),
  department: text('department'), // GeM only
  state: text('state'), // state list only
  category: text('category'), // GeM product category
  publishedAt: timestamp('published_at', { withTimezone: true }),
  closingAt: timestamp('closing_at', { withTimezone: true }),
  openingAt: timestamp('opening_at', { withTimezone: true }),
  url: text('url'), // a link that works for anyone, or null
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('public_tenders_source_key_unique').on(t.source, t.sourceKey),
  index('public_tenders_closing_idx').on(t.closingAt),
  index('public_tenders_published_idx').on(t.publishedAt),
  index('public_tenders_kind_closing_idx').on(t.kind, t.closingAt),
  index('public_tenders_state_idx').on(t.state, t.closingAt),
  index('public_tenders_org_idx').on(t.organisation),
]);

// Where the collector is in each list, so a full pass survives restarts and
// the app can say honestly how fresh each list is.
export const discoveryState = pgTable('discovery_state', {
  list: text('list').primaryKey(), // 'central' | 'state' | 'gem'
  nextPage: integer('next_page').notNull().default(1),
  totalPages: integer('total_pages'),
  sweepStartedAt: timestamp('sweep_started_at', { withTimezone: true }),
  lastSweepFinishedAt: timestamp('last_sweep_finished_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
