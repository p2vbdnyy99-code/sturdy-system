// Postgres enums shared across the BidPilot schema.
// -----------------------------------------------------------------------------
// Native pg enums (not free-text + app-level validation) so an invalid status
// can never land in the database, regardless of which code path writes it.

import { pgEnum } from 'drizzle-orm/pg-core';

// Business lifecycle of a tender — deliberately separate from processingStatus
// below. A tender can be SUBMITTED (business status) while its LATEST re-upload
// is still PROCESSING (document status); conflating them would make either
// status lie in that window.
export const tenderStatus = pgEnum('tender_status', [
  'NEW',
  'REVIEWING',
  'INTERESTED',
  'PREPARING_BID',
  'SUBMITTED',
  'AWARDED',
  'NOT_AWARDED',
  'CLOSED',
]);

// Document-processing pipeline state for a tender's ingestion.
export const tenderProcessingStatus = pgEnum('tender_processing_status', [
  'UPLOADED',
  'PROCESSING',
  'EXTRACTING',
  'ANALYZING',
  'COMPLETED',
  'FAILED',
]);

export const requirementCategory = pgEnum('requirement_category', [
  'FINANCIAL',
  'TECHNICAL',
  'LEGAL',
  'EXPERIENCE',
  'CERTIFICATION',
  'LICENSE',
  'MANPOWER',
  'EQUIPMENT',
  'OEM',
  'DOCUMENT',
  'GEOGRAPHIC',
  'OTHER',
]);

// Shared by tender_requirements.company_status and compliance_items.status —
// deliberately three values, no numeric score. See PHASE 9 in the product
// spec: never a "winning probability", never a guarantee — only evidence.
export const eligibilityStatus = pgEnum('eligibility_status', [
  'MEETS',
  'UNKNOWN',
  'DOES_NOT_APPEAR_TO_MEET',
]);

export const subscriptionStatus = pgEnum('subscription_status', [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
]);

// A user's role within one company (see company_members — a user can belong to
// more than one company, each with its own role).
export const companyMemberRole = pgEnum('company_member_role', [
  'owner',
  'admin',
  'member',
]);
