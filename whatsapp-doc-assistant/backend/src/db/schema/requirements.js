// Requirements and their evidence — the "evidence-first" invariant.
// -----------------------------------------------------------------------------
// A tender_requirements row is a CLAIM ("minimum turnover ₹5 crore, mandatory").
// A tender_requirement_evidence row is what backs it (source page + quote).
//
// The schema intentionally does NOT enforce "at least one evidence row" with a
// database constraint — that's a cross-table invariant Postgres can't express
// declaratively without a trigger, and triggers hide the rule from anyone
// reading the schema. Instead it's enforced at the one place all writes must
// pass through: src/bidpilot/repo/requirements.js only exposes
// createRequirementWithEvidence(), which inserts both rows in a single
// transaction. There is no exported "create a bare requirement" function. See
// that file and test/db/requirements-evidence.test.js.

import { pgTable, uuid, text, integer, boolean, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { requirementCategory, eligibilityStatus } from './enums.js';

export const tenderRequirements = pgTable('tender_requirements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),

  category: requirementCategory('category').notNull(),
  description: text('description').notNull(),
  mandatory: boolean('mandatory').notNull().default(true),

  // Set by the (future) eligibility engine comparing this requirement against
  // the company profile. UNKNOWN until that runs — never inferred at write
  // time, and never a numeric "probability".
  companyStatus: eligibilityStatus('company_status').notNull().default('UNKNOWN'),
  actionRequired: text('action_required'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_requirements_tender_idx').on(t.tenderId),
  index('tender_requirements_category_idx').on(t.category),
]);

export const tenderRequirementEvidence = pgTable('tender_requirement_evidence', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requirementId: uuid('requirement_id').notNull()
    .references(() => tenderRequirements.id, { onDelete: 'cascade' }),

  sourcePage: integer('source_page'),
  evidenceText: text('evidence_text').notNull(),
  // The normalized/parsed value if one was extracted, e.g. "₹5 crore" — kept
  // as text (not numeric) because tender language is rarely a clean number
  // ("₹5 crore or equivalent in USD") and forcing it into numeric would mean
  // silently dropping the qualifier.
  extractedValue: text('extracted_value'),
  confidence: numeric('confidence'), // 0..1, nullable — not every extraction scores itself
  extractionMetadata: jsonb('extraction_metadata'), // model/run id, prompt version, etc.

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_requirement_evidence_requirement_idx').on(t.requirementId),
]);
