// Tender document records + duplicate detection.
// -----------------------------------------------------------------------------
// Dedupe rule (deliberately specific, see BIDPILOT_ARCHITECTURE.md "Duplicate
// handling"): if the SAME company already has a document with this exact
// content hash attached to a tender that is NOT in a FAILED state, treat the
// new upload as that same tender (idempotent — a network retry can't spawn a
// second processing job). If the only match is on a FAILED tender, allow a
// fresh attempt — retrying after a failure is exactly what should happen.

import { and, eq, ne } from 'drizzle-orm';
import { tenderDocuments, tenders } from '../../db/schema/index.js';

export async function createTenderDocument(scope, tenderId, fields) {
  const [row] = await scope.db
    .insert(tenderDocuments)
    .values({ tenderId, ...fields })
    .returning();
  return row;
}

/**
 * Look for an existing, non-failed tender in this company whose document
 * matches `contentHash`. Returns the tender row, or undefined if none.
 */
export async function findDuplicateTender(scope, contentHash) {
  if (!contentHash) return undefined;

  const [match] = await scope.db
    .select({ tender: tenders })
    .from(tenderDocuments)
    .innerJoin(tenders, eq(tenders.id, tenderDocuments.tenderId))
    .where(
      and(
        eq(tenders.companyId, scope.companyId),
        eq(tenderDocuments.contentHash, contentHash),
        ne(tenders.processingStatus, 'FAILED'),
      ),
    )
    .limit(1);

  return match?.tender;
}

export async function listDocumentsForTender(scope, tenderId) {
  // tenderId ownership must already be confirmed by the caller (mirrors the
  // requirements-evidence pattern) — this just fetches the rows.
  return scope.db
    .select()
    .from(tenderDocuments)
    .where(eq(tenderDocuments.tenderId, tenderId));
}
