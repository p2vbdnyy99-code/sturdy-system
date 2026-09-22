import { eq } from 'drizzle-orm';
import { tenderPages } from '../../db/schema/index.js';

/** Bulk-insert extracted pages for a tender. Caller must have already
 *  confirmed tenderId ownership (see requirements.js for the pattern). */
export async function insertPages(scope, tenderId, pages) {
  if (!pages.length) return [];
  return scope.db
    .insert(tenderPages)
    .values(pages.map((p) => ({ tenderId, ...p })))
    .returning();
}

export async function listPages(scope, tenderId) {
  return scope.db
    .select()
    .from(tenderPages)
    .where(eq(tenderPages.tenderId, tenderId));
}
