// Bill of Quantities line items — extracted, never invented. Quantity/unit are
// nullable on purpose: a real BOQ row missing a unit should surface as an
// absence to resolve, not be coerced into a fabricated default.

import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';

export const tenderBoqItems = pgTable('tender_boq_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),

  itemNumber: text('item_number'),
  description: text('description').notNull(),
  quantity: numeric('quantity'),
  unit: text('unit'),
  technicalSpecification: text('technical_specification'),
  remarks: text('remarks'),
  sourcePage: integer('source_page'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_boq_items_tender_idx').on(t.tenderId),
]);
