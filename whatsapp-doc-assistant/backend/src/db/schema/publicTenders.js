// The tender feed (Oct 2026): tenders seen on public government listings
// (bidpilot/discovery/), shared by every company because they are public
// notices. Only basic metadata is kept, with a link back to the portal;
// documents are never downloaded. Coverage starts when collection starts:
// the public listing shows only the newest tenders, so this is not a
// complete archive.

import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const publicTenders = pgTable('public_tenders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  source: text('source').notNull(), // 'cppp'
  sourceKey: text('source_key').notNull(), // the portal's own reference / tender id
  title: text('title').notNull(),
  reference: text('reference'),
  organisation: text('organisation'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  closingAt: timestamp('closing_at', { withTimezone: true }),
  openingAt: timestamp('opening_at', { withTimezone: true }),
  url: text('url'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('public_tenders_source_key_unique').on(t.source, t.sourceKey),
  index('public_tenders_closing_idx').on(t.closingAt),
  index('public_tenders_published_idx').on(t.publishedAt),
]);
