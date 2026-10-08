// Compliance matrix — the exportable, requirement-by-requirement view used for
// XLSX/PDF generation (reusing the existing docx.js/xlsx.js engine, Milestone
// 10+, not this one). A row is generated FROM a requirement; cascade-deleting
// it alongside that requirement keeps the export consistent with the
// requirements it was derived from rather than leaving orphaned rows behind.

import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { tenderRequirements } from './requirements.js';
import { eligibilityStatus } from './enums.js';

export const complianceItems = pgTable('compliance_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  requirementId: uuid('requirement_id').notNull()
    .references(() => tenderRequirements.id, { onDelete: 'cascade' }),

  evidenceRequired: text('evidence_required'),
  companyEvidence: text('company_evidence'),
  status: eligibilityStatus('status').notNull().default('UNKNOWN'),
  sourcePage: integer('source_page'),
  actionRequired: text('action_required'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('compliance_items_tender_idx').on(t.tenderId),
  index('compliance_items_requirement_idx').on(t.requirementId),
]);
