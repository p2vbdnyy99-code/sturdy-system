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
