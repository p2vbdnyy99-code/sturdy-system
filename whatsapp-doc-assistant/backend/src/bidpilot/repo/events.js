import { desc, eq } from 'drizzle-orm';
import { tenderEvents } from '../../db/schema/index.js';

/** Caller must have already confirmed tenderId ownership (see
 *  requirements.js for the pattern). Newest first — this is an activity feed,
 *  not a full audit export (audit_logs is that; see events.js's schema
 *  header), so a bounded page is the right default rather than every row
 *  ever written. */
export async function listEvents(scope, tenderId, { limit = 20 } = {}) {
  return scope.db
    .select()
    .from(tenderEvents)
    .where(eq(tenderEvents.tenderId, tenderId))
    .orderBy(desc(tenderEvents.createdAt))
    .limit(limit);
}
