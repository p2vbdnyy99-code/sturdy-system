// Client workspaces (Oct 2026): a tender consultant's clients, each with its
// own profile, under the consultant's one company and one plan. A tender may
// be marked as being for a client (tenders.client_id); eligibility is then
// checked against that client's profile instead of the company's.

import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './identity.js';
import { profileColumns } from './companyProfile.js';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('clients_company_idx').on(t.companyId),
  unique('clients_company_name_unique').on(t.companyId, t.name),
]);

export const clientProfiles = pgTable('client_profiles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  ...profileColumns(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('client_profiles_client_unique').on(t.clientId),
]);
