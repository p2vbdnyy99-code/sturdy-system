// Tenders and their directly-owned children: pages and uploaded documents.
// -----------------------------------------------------------------------------
// tenders.companyId is the hard tenant boundary for this whole subtree — every
// query against a tender (and anything hanging off it) MUST be scoped by it.
// See src/bidpilot/repo/tenants.js.

import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, users } from './identity.js';
import { tenderStatus, tenderProcessingStatus, tenderAnalysisStatus } from './enums.js';

export const tenders = pgTable('tenders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),

  title: text('title'),
  organization: text('organization'),
  tenderNumber: text('tender_number'),
  location: text('location'),

  // Free text, not numeric — same reasoning as contractDuration below: real
  // tenders describe these as "₹5 crore" or "₹5 crore or equivalent in USD",
  // and a numeric column would either reject that or silently truncate the
  // qualifier. (Originally typed numeric; found to reject the AI's own
  // extracted values during Milestone 5a and corrected here — see
  // BIDPILOT_ARCHITECTURE.md.)
  estimatedValue: text('estimated_value'),
  emd: text('emd'),
  tenderFee: text('tender_fee'),
  // Prose, deliberately not an interval: real tenders describe this as
  // "12 months from LOI" or "2 years, extendable" — free text is honest about
  // what's actually extractable; a rigid interval type would force fabrication.
  contractDuration: text('contract_duration'),

  submissionDeadline: timestamp('submission_deadline', { withTimezone: true }),
  openingDate: timestamp('opening_date', { withTimezone: true }),

  // Per-field source-page evidence for the overview scalars above — e.g.
  // { organization: { sourcePage: 1, evidenceText: "..." }, ... }. A jsonb
  // map (not 9 new sourcePage/evidenceText column pairs) because it's read
  // as a whole alongside the tender and never independently queried/filtered
  // — same reasoning as company_profiles' jsonb fields (Milestone 1).
  // Populated only for fields the analysis pipeline extracted WITH a real
  // page citation; per Milestone 4's explicit requirement, an overview value
  // is never persisted with a fabricated page number.
  overviewEvidence: jsonb('overview_evidence'),

  // Business lifecycle vs. document-processing state are separate columns on
  // purpose (Milestone 1 instructions, §6) — a SUBMITTED tender whose
  // re-uploaded addendum is still EXTRACTING must not have either status lie.
  status: tenderStatus('status').notNull().default('NEW'),
  processingStatus: tenderProcessingStatus('processing_status').notNull().default('UPLOADED'),
  processingError: text('processing_error'),

  // Paid AI analysis (Milestone 4) — separate from processingStatus above on
  // purpose (see tenderAnalysisStatus's docblock in enums.js). Re-running
  // analysis is a full replace, not a merge (see
  // src/bidpilot/repo/analysis.js) — analyzedAt is when the CURRENT
  // (replaced) analysis last completed, not a history of past runs.
  analysisStatus: tenderAnalysisStatus('analysis_status').notNull().default('NOT_STARTED'),
  analysisError: text('analysis_error'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),

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
  index('tenders_analysis_status_idx').on(t.analysisStatus),
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
  // A backend-relative object KEY (local filename or S3 key), never a raw
  // filesystem path and never derived from user input — see
  // src/bidpilot/storage/*.js's newKey(). The database never stores the file
  // bytes, only this reference. NOTE: switching BIDPILOT_STORAGE_DRIVER after
  // documents already exist under the old driver requires a migration/backfill
  // of existing rows' files — not handled automatically.
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  // sha256 of the file content — the dedupe key (see
  // src/bidpilot/repo/documents.js findDuplicate()). Not unique at the DB
  // level: the same file hash CAN legitimately recur across different
  // companies, or after a prior attempt FAILED — dedupe logic decides what to
  // do with a match, the schema just makes the lookup possible.
  contentHash: text('content_hash'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_documents_tender_idx').on(t.tenderId),
  index('tender_documents_content_hash_idx').on(t.contentHash),
]);

// AI-extracted facts about the tender document itself — distinct from
// tender_events (application activity: "user marked INTERESTED"). This table
// is DOCUMENT data: "pre-bid meeting — 12 Oct 2026 — page 14". Cleared and
// fully repopulated on every analysis run (see repo/analysis.js) — never
// accumulates duplicates across re-analyses.
export const tenderDates = pgTable('tender_dates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),

  label: text('label').notNull(), // e.g. "Pre-bid meeting", "EMD submission deadline"
  // The parsed calendar date, ONLY when confidently extractable — nullable
  // because tenders often describe a date relatively ("within 15 days of
  // opening") rather than as a fixed calendar date; rawText is always the
  // honest source of truth, parsedDate is a best-effort convenience.
  parsedDate: timestamp('parsed_date', { withTimezone: true }),
  rawText: text('raw_text').notNull(),
  sourcePage: integer('source_page'),
  evidenceText: text('evidence_text'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_dates_tender_idx').on(t.tenderId),
]);

// Risk observations about the tender — NOT a "requirement" (something the
// bidder must satisfy); a red flag is an observation worth a human's
// attention (a one-sided clause, an unusually short window, ...). Kept
// deliberately minimal for v1 — no severity field; easy to add later if
// the UI demonstrates a need for one.
export const tenderRedFlags = pgTable('tender_red_flags', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),

  description: text('description').notNull(),
  sourcePage: integer('source_page'),
  evidenceText: text('evidence_text'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_red_flags_tender_idx').on(t.tenderId),
]);
