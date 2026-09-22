import { eq } from 'drizzle-orm';
import { tenderDates } from '../../db/schema/index.js';

export async function insertDates(scope, tenderId, dates) {
  if (!dates.length) return [];
  return scope.db
    .insert(tenderDates)
    .values(dates.map((d) => ({ tenderId, ...d })))
    .returning();
}

export async function listDates(scope, tenderId) {
  return scope.db.select().from(tenderDates).where(eq(tenderDates.tenderId, tenderId));
}
