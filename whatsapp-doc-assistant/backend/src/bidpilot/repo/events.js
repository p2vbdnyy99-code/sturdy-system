import { and, desc, eq, inArray } from 'drizzle-orm';
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

/** The event written by the most recent SUCCESSFUL analysis — i.e. the one
 *  whose data the tender currently shows. A later failed run writes no such
 *  event, so this still describes what's on screen. Same ownership caveat. */
export async function getLatestAnalysisEvent(scope, tenderId) {
  const [row] = await scope.db
    .select()
    .from(tenderEvents)
    .where(and(
      eq(tenderEvents.tenderId, tenderId),
      inArray(tenderEvents.eventType, ['analysis_completed', 'analysis_replaced']),
    ))
    .orderBy(desc(tenderEvents.createdAt))
    .limit(1);
  return row;
}
