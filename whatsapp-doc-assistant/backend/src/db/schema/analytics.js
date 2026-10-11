// Visit counts for the TenderTez website, recorded by the site itself (no
// third-party analytics). One row per page view. Nothing here identifies a
// person: no IP address, no user id, no cookie. visitorId is a hash of the
// IP and browser with a random salt that lives only in memory and changes
// every day, so it can count unique visitors within one day and nothing more.
// See src/bidpilot/visits.js.

import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const pageViews = pgTable('page_views', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  day: date('day').notNull(), // the visit's date in India (IST)
  path: text('path').notNull(), // a known route, with ids replaced (/tenders/:id)
  source: text('source').notNull(), // referring site's hostname, or 'direct'
  campaign: text('campaign'), // utm_source from the landing URL, if any
  device: text('device').notNull(), // 'mobile' | 'desktop'
  visitorId: text('visitor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('page_views_day_idx').on(t.day),
]);
