// Tender CRUD — every function takes a CompanyScope (see repo/tenants.js), not
// a bare companyId, so it's structurally impossible to call these without
// having first proven the caller belongs to that company.

import { and, eq, ne } from 'drizzle-orm';
import { tenders } from '../../db/schema/index.js';

export async function createTender(scope, fields) {
  return scope.insertOwned(tenders, 'companyId', fields);
}

export async function getTender(scope, tenderId) {
  return scope.getOwned(tenders, tenders.id, tenders.companyId, tenderId);
}

export async function listTenders(scope) {
  return scope.listOwned(tenders, tenders.companyId);
}

export async function updateTenderStatus(scope, tenderId, status) {
  return scope.updateOwned(tenders, tenders.id, tenders.companyId, tenderId, {
    status,
    updatedAt: new Date(),
  });
}

export async function updateProcessingStatus(scope, tenderId, processingStatus, processingError = null) {
  return scope.updateOwned(tenders, tenders.id, tenders.companyId, tenderId, {
    processingStatus,
    processingError,
    updatedAt: new Date(),
  });
}

/**
 * Atomically transition a tender to ANALYZING — an UPDATE ... WHERE
 * analysis_status != 'ANALYZING' RETURNING *, so a double-click (or two
 * concurrent requests) can't both start an analysis run: only the request
 * whose UPDATE actually matched a row (returns non-undefined) may proceed.
 * The second gets undefined and must reject with "already in progress" —
 * no separate lock module needed, the row itself is the compare-and-set.
 */
export async function startAnalysis(scope, tenderId) {
  const [row] = await scope.db
    .update(tenders)
    .set({ analysisStatus: 'ANALYZING', analysisError: null, updatedAt: new Date() })
    .where(and(
      eq(tenders.id, tenderId),
      eq(tenders.companyId, scope.companyId),
      ne(tenders.analysisStatus, 'ANALYZING'),
    ))
    .returning();
  return row;
}
