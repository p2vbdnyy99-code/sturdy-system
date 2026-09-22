// Billing shape — schema only. Milestone 1 explicitly excludes billing logic
// (no plan-config table, no payment provider, no enforcement); this exists so
// a later milestone can build on a stable table rather than adding one via
// surprise migration. subscriptions allows multiple rows per company (a
// history), not a single unique row — "current plan" is the latest row by
// createdAt, which avoids losing plan-change history the first time it matters.

import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './identity.js';
import { tenders } from './tenders.js';
import { subscriptionStatus } from './enums.js';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Plan slug/name as DATA, not an enum — plan definitions (price, quota) live
  // in application config/DB rows a later milestone adds, never hardcoded into
  // business logic. See PHASE 20 of the product spec.
  plan: text('plan').notNull().default('FREE'),
  status: subscriptionStatus('status').notNull().default('TRIALING'),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('subscriptions_company_idx').on(t.companyId),
]);

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  tenderId: uuid('tender_id').references(() => tenders.id, { onDelete: 'set null' }),

  kind: text('kind').notNull(), // e.g. 'tender_analysis', 'ocr_page', 'ai_call'
  quantity: integer('quantity').notNull().default(1),
  metadata: jsonb('metadata'), // e.g. estimated cost, token counts

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The query this exists to serve: "this company's usage this month".
  index('usage_records_company_created_idx').on(t.companyId, t.createdAt),
]);
