// Requirement creation — the evidence-first enforcement point.
// -----------------------------------------------------------------------------
// tender_requirements doesn't carry its own companyId (it's a child of
// tenders); access is enforced by first confirming the parent tender belongs
// to the caller's CompanyScope, exactly like every other tender-child table.
//
// There is deliberately no exported "insert a bare requirement" function.
// createRequirementWithEvidence() is the only way to create one, requires at
// least one evidence entry, and writes both in a single transaction — so a
// requirement can never exist (even transiently, even after a crash mid-write)
// without something backing it. See test/db/requirements-evidence.test.js.

import { eq } from 'drizzle-orm';
import { getTender } from './tenders.js';
import { tenderRequirements, tenderRequirementEvidence } from '../../db/schema/index.js';

export class MissingEvidenceError extends Error {
  constructor() {
    super('A tender requirement cannot be created without at least one evidence entry.');
    this.name = 'MissingEvidenceError';
  }
}

/**
 * Create a requirement plus its evidence in one transaction.
 * @param {object} requirementFields - { category, description, mandatory? }
 * @param {Array<{sourcePage?, evidenceText, extractedValue?, confidence?, extractionMetadata?}>} evidence
 */
export async function createRequirementWithEvidence(scope, tenderId, requirementFields, evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new MissingEvidenceError();
  }
  // Confirms the tender belongs to this scope's company before writing
  // anything — a requirement can never be attached to a tender the caller
  // doesn't own, even indirectly.
  const tender = await getTender(scope, tenderId);
  if (!tender) {
    throw new Error(`Tender ${tenderId} not found in this company.`);
  }

  return scope.db.transaction(async (tx) => {
    const [requirement] = await tx
      .insert(tenderRequirements)
      .values({ tenderId, ...requirementFields })
      .returning();

    const evidenceRows = await tx
      .insert(tenderRequirementEvidence)
      .values(evidence.map((e) => ({ requirementId: requirement.id, ...e })))
      .returning();

    return { requirement, evidence: evidenceRows };
  });
}

/** Caller must have already confirmed tenderId ownership (mirrors the
 *  pattern used throughout — see e.g. repo/pages.js). */
export async function listRequirements(scope, tenderId) {
  return scope.db.select().from(tenderRequirements).where(eq(tenderRequirements.tenderId, tenderId));
}

export async function listEvidenceForRequirement(scope, requirementId) {
  return scope.db
    .select()
    .from(tenderRequirementEvidence)
    .where(eq(tenderRequirementEvidence.requirementId, requirementId));
}

/** Bulk-write eligibility results for a tender's requirements (Milestone 6).
 *  `results` is an array of {requirementId, companyStatus, actionRequired,
 *  companyEvidence} — each requirementId MUST already be one of this
 *  tender's own requirement ids (the caller, analysis/eligibilityPipeline.js,
 *  is responsible for that mapping AND for verifying companyEvidence against
 *  the real company_profiles row before it ever reaches here — this function
 *  trusts its input the same way replaceAnalysis() trusts already-validated
 *  aggregated results). Touches ONLY these three columns — category, title,
 *  description, mandatory, and tender_requirement_evidence are never written
 *  by this function, by construction (they're not in the SET clause). Caller
 *  must have already confirmed tenderId ownership, same pattern as
 *  listRequirements(). */
export async function applyEligibilityResults(scope, results) {
  if (!results.length) return;
  await scope.db.transaction(async (tx) => {
    for (const { requirementId, companyStatus, actionRequired, companyEvidence } of results) {
      await tx
        .update(tenderRequirements)
        .set({ companyStatus, actionRequired, companyEvidence, updatedAt: new Date() })
        .where(eq(tenderRequirements.id, requirementId));
    }
  });
}
