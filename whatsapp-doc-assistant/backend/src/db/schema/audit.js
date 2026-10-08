// Security/compliance audit trail. Every write MUST go through
// src/bidpilot/repo/audit.js's recordAuditLog(), which enforces the "never log
// secrets or full document content" rule at the one place all audit writes
// pass through (see that file's docblock and its redaction tests) — this
// schema file only defines shape, it cannot enforce what callers put in
// `metadata`.
//
// entityId is intentionally NOT a foreign key: audit rows must survive the
// entity they describe being deleted later (that's the point of an audit
// trail), so it's a plain uuid, not a references() column.

import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, companies } from './identity.js';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),

  action: text('action').notNull(), // e.g. 'tender.created', 'requirement.updated'
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_logs_company_created_idx').on(t.companyId, t.createdAt),
  index('audit_logs_entity_idx').on(t.entityType, t.entityId),
]);
