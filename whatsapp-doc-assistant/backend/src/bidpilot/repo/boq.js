import { eq } from 'drizzle-orm';
import { tenderBoqItems } from '../../db/schema/index.js';

/** Caller must have already confirmed tenderId ownership (see
 *  requirements.js for the pattern) — BOQ items don't carry their own
 *  companyId, they're a child of tenders. */
export async function listBoq(scope, tenderId) {
  return scope.db
    .select()
    .from(tenderBoqItems)
    .where(eq(tenderBoqItems.tenderId, tenderId));
}
