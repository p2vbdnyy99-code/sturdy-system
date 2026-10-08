import { eq } from 'drizzle-orm';
import { tenderRedFlags } from '../../db/schema/index.js';

export async function insertRedFlags(scope, tenderId, flags) {
  if (!flags.length) return [];
  return scope.db
    .insert(tenderRedFlags)
    .values(flags.map((f) => ({ tenderId, ...f })))
    .returning();
}

export async function listRedFlags(scope, tenderId) {
  return scope.db.select().from(tenderRedFlags).where(eq(tenderRedFlags.tenderId, tenderId));
}
