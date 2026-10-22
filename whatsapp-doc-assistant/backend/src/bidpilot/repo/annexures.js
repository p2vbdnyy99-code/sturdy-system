// Stored annexure drafts (tender_annexure_drafts): one per format per
// tender; drafting again replaces it. Callers confirm the tender belongs to
// the scope's company (getTender) first; every query also matches it.

import { and, asc, eq } from 'drizzle-orm';
import { tenderAnnexureDrafts } from '../../db/schema/index.js';

export async function listDrafts(scope, tenderId) {
  return scope.db.select().from(tenderAnnexureDrafts)
    .where(and(eq(tenderAnnexureDrafts.tenderId, tenderId), eq(tenderAnnexureDrafts.companyId, scope.companyId)))
    .orderBy(asc(tenderAnnexureDrafts.formatKey));
}

export async function getDraft(scope, tenderId, formatKey) {
  const [row] = await scope.db.select().from(tenderAnnexureDrafts)
    .where(and(
      eq(tenderAnnexureDrafts.tenderId, tenderId),
      eq(tenderAnnexureDrafts.companyId, scope.companyId),
      eq(tenderAnnexureDrafts.formatKey, formatKey),
    ))
    .limit(1);
  return row;
}

export async function saveDraft(scope, { tenderId, clientId, formatKey, title, pages, blocks, userId }) {
  const now = new Date();
  const [row] = await scope.db.insert(tenderAnnexureDrafts)
    .values({ tenderId, companyId: scope.companyId, clientId: clientId ?? null, formatKey, title, pages, blocks, createdBy: userId })
    .onConflictDoUpdate({
      target: [tenderAnnexureDrafts.tenderId, tenderAnnexureDrafts.formatKey],
      set: { clientId: clientId ?? null, title, pages, blocks, createdBy: userId, updatedAt: now },
      where: eq(tenderAnnexureDrafts.companyId, scope.companyId),
    })
    .returning();
  return row;
}
