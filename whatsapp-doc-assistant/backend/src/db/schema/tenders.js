// Tenders and their directly-owned children: pages and uploaded documents.
// -----------------------------------------------------------------------------
// tenders.companyId is the hard tenant boundary for this whole subtree — every
// query against a tender (and anything hanging off it) MUST be scoped by it.
// See src/bidpilot/repo/tenants.js.

import { pgTable, uuid, text, integer, numeric, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, users } from './identity.js';
import { tenderStatus, tenderProcessingStatus } from './enums.js';

export const tenders = pgTable('tenders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),

  title: text('title'),
  organization: text('organization'),
  tenderNumber: text('tender_number'),
  location: text('location'),

  estimatedValue: numeric('estimated_value'),
  emd: numeric('emd'),
  tenderFee: numeric('tender_fee'),
  // Prose, deliberately not an interval: real tenders describe this as
  // "12 months from LOI" or "2 years, extendable" — free text is honest about
  // what's actually extractable; a rigid interval type would force fabrication.
  contractDuration: text('contract_duration'),

  submissionDeadline: timestamp('submission_deadline', { withTimezone: true }),
  openingDate: timestamp('opening_date', { withTimezone: true }),

  // Business lifecycle vs. document-processing state are separate columns on
  // purpose (Milestone 1 instructions, §6) — a SUBMITTED tender whose
  // re-uploaded addendum is still EXTRACTING must not have either status lie.
  status: tenderStatus('status').notNull().default('NEW'),
  processingStatus: tenderProcessingStatus('processing_status').notNull().default('UPLOADED'),
  processingError: text('processing_error'),

  // Where this tender came from — 'upload' today; 'telegram' once that adapter
  // exists; 'scraper' only once automatic discovery is ever built (not yet).
  source: text('source').notNull().default('upload'),

  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tenders_company_idx').on(t.companyId),
  index('tenders_status_idx').on(t.status),
  index('tenders_processing_status_idx').on(t.processingStatus),
  index('tenders_deadline_idx').on(t.submissionDeadline),
]);

export const tenderPages = pgTable('tender_pages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  rawText: text('raw_text'),
  ocrUsed: boolean('ocr_used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('tender_pages_tender_page_unique').on(t.tenderId, t.pageNumber),
  index('tender_pages_tender_idx').on(t.tenderId),
]);

export const tenderDocuments = pgTable('tender_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  // Local disk path today (matches the existing storage.js pattern); an
  // object-storage URL later is a value change, not a schema change.
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_documents_tender_idx').on(t.tenderId),
]);
