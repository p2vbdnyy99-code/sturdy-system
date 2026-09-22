// Company profile: the eligibility engine's other input (tender requirements
// are the first). One row per company (1:1) — created lazily, not at signup,
// since a company can exist before its profile is filled in.
// -----------------------------------------------------------------------------
// Repeatable/list-shaped facts (certifications, licenses, equipment, OEM
// relationships, past project experience) are stored as jsonb arrays rather
// than normalized child tables. Per Milestone 1 instructions: "avoid
// over-normalizing fields that do not need to be independently queried" — none
// of these are queried/filtered on independently today (the eligibility engine
// reads the whole profile per tender, it doesn't run "find all companies with
// certification X" queries). If that changes, promoting one of these fields to
// its own table is a small, isolated migration — not a schema-wide rethink.

import { pgTable, uuid, text, integer, numeric, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './identity.js';

export const companyProfiles = pgTable('company_profiles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  industry: text('industry'),
  businessType: text('business_type'),
  gstin: text('gstin'),
  registrationDetails: text('registration_details'),

  yearsInBusiness: integer('years_in_business'),
  annualTurnover: numeric('annual_turnover'),
  netWorth: numeric('net_worth'),
  employeeCount: integer('employee_count'),

  // Free-text region/state/country list — not normalized; see file header.
  geography: jsonb('geography').$type().default(sql`'[]'::jsonb`),
  certifications: jsonb('certifications').$type().default(sql`'[]'::jsonb`),
  licenses: jsonb('licenses').$type().default(sql`'[]'::jsonb`),
  equipment: jsonb('equipment').$type().default(sql`'[]'::jsonb`),
  oemRelationships: jsonb('oem_relationships').$type().default(sql`'[]'::jsonb`),
  // Array of { description, value, year, client } objects — previous/similar
  // project experience, the evidence the eligibility engine cites against an
  // "experience" requirement.
  experience: jsonb('experience').$type().default(sql`'[]'::jsonb`),
  otherQualifications: text('other_qualifications'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('company_profiles_company_unique').on(t.companyId),
]);
