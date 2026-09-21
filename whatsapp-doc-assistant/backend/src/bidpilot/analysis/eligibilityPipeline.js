// Milestone 6 — the eligibility-check orchestration: requirements + company
// profile -> one AI comparison call -> validate -> VERIFY against the real
// profile -> persist.
// -----------------------------------------------------------------------------
// Unlike runAnalysis() (Milestone 4), this runs ON the request path, not via
// setImmediate: it is always exactly one AI call (never chunked), so there is
// no long-running work to acknowledge-then-poll for. Budget/provider errors
// are therefore NOT swallowed-and-logged here — they propagate to the caller
// (routes/tenders.js) to become a proper HTTP error response, and nothing is
// written to the database on failure. A requirement's prior companyStatus is
// only ever touched by a run that actually produced a validated result for
// it — never blanked out by a failed attempt.
//
// The verification step below is the actual security fix from this
// milestone's review: eligibility.js's validateEligibilityResult() only
// checks the AI reply's SHAPE. This function additionally checks its
// CONTENT against the real company_profiles row — a MEETS/DOES_NOT_APPEAR_TO
// _MEET verdict is only ever persisted as-is if it cites at least one real,
// whitelisted profile field that actually has a value AND a non-empty reason
// connecting it to the requirement. If not, the verdict is forcibly
// downgraded to UNKNOWN. The AI never supplies the persisted `value` for a
// cited field — only the server does, read fresh from the profile it
// already has in hand.
//
// Deliberate scope limit: the server verifies a cited field is REAL and
// NON-EMPTY, and that a reason string exists — it does NOT independently
// verify the reason is topically relevant to the specific requirement (e.g.
// it cannot catch an AI citing "annualTurnover" with a reason for an ISO-
// certification requirement). Judging that semantic connection is the AI's
// job, made auditable — not just asserted — via the persisted `reason` text
// a human can review; building a second verification pass to grade that
// judgment would be a meaningfully bigger, separate feature, not something
// this milestone's scope calls for.

import { tenderEvents } from '../../db/schema/index.js';
import { getCompanyProfile } from '../repo/companies.js';
import { listRequirements, applyEligibilityResults } from '../repo/requirements.js';
import { assertEligibilityBudget, recordEligibilityUsage } from './budget.js';
import { evaluateEligibility, validateEligibilityResult } from './eligibility.js';

export class EligibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EligibilityError';
  }
}

const PROFILE_FIELD_LABELS = {
  industry: 'Industry',
  businessType: 'Business Type',
  gstin: 'GSTIN',
  registrationDetails: 'Registration Details',
  yearsInBusiness: 'Years in Business',
  annualTurnover: 'Annual Turnover',
  netWorth: 'Net Worth',
  employeeCount: 'Employee Count',
  geography: 'Geography',
  certifications: 'Certifications',
  licenses: 'Licenses',
  equipment: 'Equipment',
  oemRelationships: 'OEM Relationships',
  experience: 'Experience',
  otherQualifications: 'Other Qualifications',
};
const PROFILE_FIELDS = Object.keys(PROFILE_FIELD_LABELS);

function profileSummary(profile) {
  const out = {};
  for (const key of PROFILE_FIELDS) out[key] = profile[key];
  return out;
}

/** A field "has a value" if it's a non-empty array (list-shaped fields
 *  default to '[]', which is non-null but not evidence of anything) or a
 *  non-blank scalar. */
function fieldHasValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function formatFieldValue(value) {
  return (Array.isArray(value) || (value && typeof value === 'object')) ? JSON.stringify(value) : String(value);
}

const NO_EVIDENCE_ACTION = 'Could not be verified against your company profile — try again.';

/**
 * Cross-checks the AI's claimed companyEvidence field names against the REAL
 * profile row. Returns { status, actionRequired, companyEvidence } — status
 * is downgraded to UNKNOWN whenever a MEETS/DOES_NOT_APPEAR_TO_MEET claim
 * doesn't survive verification; companyEvidence only ever contains entries
 * the server itself confirmed and filled in.
 */
function verifyAgainstProfile(entry, profile) {
  if (entry.status === 'UNKNOWN') {
    return { status: 'UNKNOWN', actionRequired: entry.actionRequired, companyEvidence: [] };
  }

  const verified = [];
  for (const claim of entry.companyEvidence) {
    if (!PROFILE_FIELDS.includes(claim.field)) continue; // not a real field — ignored, not trusted
    if (!claim.reason || !claim.reason.trim()) continue; // must explain WHY this field supports THIS requirement
    const value = profile[claim.field];
    if (!fieldHasValue(value)) continue; // field is real but empty — the AI's claim doesn't hold up
    verified.push({
      field: claim.field,
      value: formatFieldValue(value), // SERVER value — the AI's own claimed value, if any, was never read
      label: PROFILE_FIELD_LABELS[claim.field],
      reason: claim.reason,
    });
  }

  if (verified.length === 0) {
    // The AI asserted MEETS/DOES_NOT_APPEAR_TO_MEET but cited nothing that
    // actually checks out — never persist an unbacked verdict.
    return { status: 'UNKNOWN', actionRequired: NO_EVIDENCE_ACTION, companyEvidence: [] };
  }
  return { status: entry.status, actionRequired: entry.actionRequired, companyEvidence: verified };
}

/**
 * @returns {{ evaluated: number, results: Array<{id, companyStatus, actionRequired, companyEvidence}> }}
 */
export async function runEligibility(scope, tenderId) {
  const requirements = await listRequirements(scope, tenderId);
  if (requirements.length === 0) {
    return { evaluated: 0, results: [] };
  }

  const profile = await getCompanyProfile(scope.db, scope.companyId);

  if (!profile) {
    const results = requirements.map((r) => ({
      requirementId: r.id,
      companyStatus: 'UNKNOWN',
      actionRequired: 'Complete your company profile to check eligibility.',
      companyEvidence: [],
    }));
    await applyEligibilityResults(scope, results);
    await writeEvent(scope, tenderId, requirements.length, results);
    return { evaluated: requirements.length, results: toResponse(results) };
  }

  // Throws AnalysisBudgetError — deliberately NOT caught here, see file header.
  await assertEligibilityBudget(scope.db, scope.companyId);

  const payload = requirements.map((r, idx) => ({
    idx, category: r.category, description: r.description, mandatory: r.mandatory,
  }));
  const raw = await evaluateEligibility(payload, profileSummary(profile));
  if (raw === null) {
    throw new EligibilityError('The eligibility check did not return a usable result. Please try again.');
  }
  const validated = validateEligibilityResult(raw);

  const results = requirements.map((r, idx) => {
    const entry = validated.get(idx);
    if (!entry) {
      return {
        requirementId: r.id, companyStatus: 'UNKNOWN',
        actionRequired: 'Could not be evaluated in this run — try again.', companyEvidence: [],
      };
    }
    const verified = verifyAgainstProfile(entry, profile);
    return { requirementId: r.id, companyStatus: verified.status, actionRequired: verified.actionRequired, companyEvidence: verified.companyEvidence };
  });

  await applyEligibilityResults(scope, results);
  await recordEligibilityUsage(scope.db, { companyId: scope.companyId, tenderId, metadata: { requirementCount: requirements.length } });
  await writeEvent(scope, tenderId, requirements.length, results);

  return { evaluated: requirements.length, results: toResponse(results) };
}

function toResponse(results) {
  return results.map(({ requirementId, companyStatus, actionRequired, companyEvidence }) => ({
    id: requirementId, companyStatus, actionRequired, companyEvidence,
  }));
}

async function writeEvent(scope, tenderId, requirementCount, results) {
  const counts = { MEETS: 0, UNKNOWN: 0, DOES_NOT_APPEAR_TO_MEET: 0 };
  for (const r of results) counts[r.companyStatus] = (counts[r.companyStatus] || 0) + 1;
  await scope.db.insert(tenderEvents).values({
    tenderId,
    eventType: 'eligibility_checked',
    description: 'Eligibility checked against company profile.',
    metadata: { requirementCount, ...counts },
  });
}
