// Identity: users, companies, and the membership between them.
// -----------------------------------------------------------------------------
// A user does NOT carry a single company_id column. Team accounts are an
// explicit planned feature (a person can belong to more than one company), so
// membership is modeled as its own join table (companyMembers) from day one —
// retrofitting that later, after tenders/requirements/etc. already reference a
// single-company user, would be exactly the kind of expensive schema surgery
// this milestone exists to avoid.
//
// companies.id is the tenant boundary. Every BidPilot-owned resource below
// (tenders, documents, requirements, ...) carries an explicit companyId — see
// src/bidpilot/repo/tenants.js for the scoped-query helpers that make that
// boundary hard to bypass by accident.

import { pgTable, uuid, text, timestamp, uniqueIndex, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companyMemberRole } from './enums.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  // Nullable: Milestone 1 ships the schema, not a login flow. A later
  // milestone owns hashing/verification; this column exists so that work
  // doesn't require another migration.
  passwordHash: text('password_hash'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Case-insensitive uniqueness ("Alice@x.com" and "alice@x.com" are one user)
  // needs a unique INDEX on an expression — a plain UNIQUE constraint can't
  // reference lower(email) in Postgres.
  uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
]);

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companyMembers = pgTable('company_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: companyMemberRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // A user has exactly one role per company — no duplicate membership rows.
  unique('company_members_user_company_unique').on(t.userId, t.companyId),
  index('company_members_company_idx').on(t.companyId),
]);
