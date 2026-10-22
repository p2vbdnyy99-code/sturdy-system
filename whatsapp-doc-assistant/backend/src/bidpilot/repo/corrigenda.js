// Corrigenda uploaded against a tender (schema/workflow.js). Callers must
// have confirmed the tender belongs to the scope's company first.

import { and, desc, eq } from 'drizzle-orm';
import { tenderCorrigenda, tenders, tenderEvents } from '../../db/schema/index.js';

export async function createCorrigendum(scope, tenderId, { filename, storageKey, createdBy }) {
  const [row] = await scope.db.insert(tenderCorrigenda)
    .values({ tenderId, filename, storageKey, createdBy: createdBy ?? null })
    .returning();
  return row;
}

export async function listCorrigenda(scope, tenderId) {
  return scope.db.select().from(tenderCorrigenda)
    .where(eq(tenderCorrigenda.tenderId, tenderId))
    .orderBy(desc(tenderCorrigenda.createdAt));
}

export async function getCorrigendum(scope, tenderId, id) {
  const [row] = await scope.db.select().from(tenderCorrigenda)
    .where(and(eq(tenderCorrigenda.id, id), eq(tenderCorrigenda.tenderId, tenderId)))
    .limit(1);
  return row;
}

export async function finishCorrigendum(scope, id, fields) {
  await scope.db.update(tenderCorrigenda).set({ ...fields, updatedAt: new Date() }).where(eq(tenderCorrigenda.id, id));
}

/**
 * Write the chosen changes onto the tender. `values` are already-validated
 * column values; `evidence` is the overview_evidence entry per field.
 */
export async function applyCorrigendum(scope, tender, corrigendum, values, evidence, userId) {
  return scope.db.transaction(async (tx) => {
    const overviewEvidence = { ...(tender.overviewEvidence || {}), ...evidence };
    const [row] = await tx.update(tenders)
      .set({ ...values, overviewEvidence, updatedAt: new Date() })
      .where(and(eq(tenders.id, tender.id), eq(tenders.companyId, scope.companyId)))
      .returning();
    await tx.update(tenderCorrigenda).set({ appliedAt: new Date(), updatedAt: new Date() }).where(eq(tenderCorrigenda.id, corrigendum.id));
    await tx.insert(tenderEvents).values({
      tenderId: tender.id,
      eventType: 'corrigendum_applied',
      description: `Applied changes from ${corrigendum.filename}`,
      metadata: { corrigendumId: corrigendum.id, fields: Object.keys(values) },
      createdBy: userId ?? null,
    });
    return row;
  });
}
