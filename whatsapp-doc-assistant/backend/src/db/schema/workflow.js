// Bid workflow (Oct 2026): the submission checklist and corrigenda.
// -----------------------------------------------------------------------------
// The checklist itself is built from the tender's extracted requirements at
// read time (repo/checklist.js), so it can never list something the tender
// doesn't ask for. Only the user's own state is stored here: a tick against a
// requirement (matched by a key of its text, so ticks survive a re-analysis
// that finds the same requirement) or an item the user added.

import { pgTable, uuid, text, integer, numeric, date, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenders } from './tenders.js';
import { users, companies } from './identity.js';
import { clients } from './clients.js';

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  // 'requirement' (a tick on an extracted requirement) or 'custom'.
  kind: text('kind').notNull(),
  // For 'requirement': a hash of the requirement's category and text.
  itemKey: text('item_key'),
  // For 'custom': what the user typed.
  label: text('label'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('checklist_items_tender_idx').on(t.tenderId),
  uniqueIndex('checklist_items_tender_key_idx').on(t.tenderId, t.itemKey),
]);

// A corrigendum (amendment) uploaded against an existing tender. Its text is
// compared with the tender's current facts; `changes` holds what differs,
// each with the page and quoted text from the corrigendum.
export const tenderCorrigenda = pgTable('tender_corrigenda', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  storageKey: text('storage_key').notNull(),
  pageCount: integer('page_count'),
  // 'PROCESSING' | 'COMPLETED' | 'FAILED'
  status: text('status').notNull().default('PROCESSING'),
  error: text('error'),
  // [{ field, label, before, after, sourcePage, evidenceText }]
  changes: jsonb('changes').$type(),
  summary: text('summary'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_corrigenda_tender_idx').on(t.tenderId),
]);

// EMD and performance security for a tender (Oct 2026): what was asked for,
// how it was given (online, DD, bank guarantee, FDR, or exempt), and whether
// it came back. Entered by the user; the tender's own EMD from the document
// is only shown as a hint.
export const tenderSecurities = pgTable('tender_securities', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'EMD' | 'PERFORMANCE'
  kind: text('kind').notNull(),
  // 'ONLINE' | 'DD' | 'BG' | 'FDR' | 'EXEMPTED' | 'NOT_REQUIRED'
  mode: text('mode').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }),
  // DD, BG or FDR number, or the payment reference.
  reference: text('reference'),
  bank: text('bank'),
  issuedOn: date('issued_on'),
  // A bank guarantee's expiry and its claim period end.
  validUntil: date('valid_until'),
  claimUntil: date('claim_until'),
  // 'TO_ARRANGE' | 'SUBMITTED' | 'RETURNED' | 'FORFEITED'
  status: text('status').notNull().default('TO_ARRANGE'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tender_securities_tender_idx').on(t.tenderId),
  index('tender_securities_company_idx').on(t.companyId, t.status),
]);

// A drafted annexure (Oct 2026): the tender's own format, from its pages,
// as paragraphs with placeholders ({{field:pan}}, {{blank:Date}}). The AI
// only places placeholders; values are filled from the company's or
// client's profile when the Word file is made (annexureDocx.js), so an
// edited profile shows up without drafting again.
export const tenderAnnexureDrafts = pgTable('tender_annexure_drafts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  // The format's first page, which identifies it within the tender.
  formatKey: integer('format_key').notNull(),
  title: text('title').notNull(),
  pages: jsonb('pages').$type().notNull(),
  // [{ text: 'I, {{field:signatoryName}}, ...' }]
  blocks: jsonb('blocks').$type().notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('tender_annexure_drafts_tender_format_idx').on(t.tenderId, t.formatKey),
]);
