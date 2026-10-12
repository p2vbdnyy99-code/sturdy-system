// When the company profile becomes required. A company can upload and
// analyse its first FREE_TENDERS_WITHOUT_PROFILE tenders without one (the
// founder found a mandatory profile up front off-putting); from the next
// tender on, upload and analysis wait until the profile is complete. The
// frontend mirrors the number in src/shell/profileGate.ts
// (profile-fields-sync.test.js checks they match).
import { asc, eq } from 'drizzle-orm';
import { tenders } from '../db/schema/index.js';
import { getCompanyProfile } from './repo/companies.js';
import { missingProfileFields } from './profileCompleteness.js';

export const FREE_TENDERS_WITHOUT_PROFILE = 2;

export const PROFILE_REQUIRED_MESSAGE =
  `You've added ${FREE_TENDERS_WITHOUT_PROFILE} tenders without a company profile. ` +
  'Please complete it to add or analyse more: it is used to check each tender\'s eligibility conditions.';

/** The company's first tenders by upload time (at most the free number). */
async function firstTenderIds(db, companyId) {
  const rows = await db.select({ id: tenders.id }).from(tenders)
    .where(eq(tenders.companyId, companyId))
    .orderBy(asc(tenders.createdAt), asc(tenders.id))
    .limit(FREE_TENDERS_WITHOUT_PROFILE);
  return rows.map((r) => r.id);
}

/**
 * Whether the profile is needed before this action. `tenderId` is the tender
 * being analysed; omit it for an upload (a new tender). Returns the missing
 * fields when the action must wait, or null when it may go ahead.
 */
export async function profileNeededFor(db, companyId, tenderId = null) {
  const missing = missingProfileFields(await getCompanyProfile(db, companyId));
  if (missing.length === 0) return null;
  const first = await firstTenderIds(db, companyId);
  const allowed = tenderId
    ? first.includes(tenderId)
    : first.length < FREE_TENDERS_WITHOUT_PROFILE;
  return allowed ? null : missing;
}
