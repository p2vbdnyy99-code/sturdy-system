// Tender CRUD — every function takes a CompanyScope (see repo/tenants.js), not
// a bare companyId, so it's structurally impossible to call these without
// having first proven the caller belongs to that company.

import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { tenders } from '../../db/schema/index.js';

const SORTABLE_COLUMNS = {
  deadline: tenders.submissionDeadline,
  createdAt: tenders.createdAt,
};

export async function createTender(scope, fields) {
  return scope.insertOwned(tenders, 'companyId', fields);
}

export async function getTender(scope, tenderId) {
  return scope.getOwned(tenders, tenders.id, tenders.companyId, tenderId);
}

export async function listTenders(scope) {
  return scope.listOwned(tenders, tenders.companyId);
}

/**
 * Paginated, filterable, sortable tender list — the dashboard's main table.
 * Unlike listTenders() (unbounded, used by the few callers that genuinely
 * want every row), this is meant for a browser page and always returns a
 * bounded slice plus the total count needed to render pagination controls.
 */
export async function listTendersPaginated(scope, {
  page = 1, limit = 20, status, analysisStatus, search,
  sortBy = 'deadline', sortOrder = 'asc',
} = {}) {
  const conditions = [eq(tenders.companyId, scope.companyId)];
  if (status) conditions.push(eq(tenders.status, status));
  if (analysisStatus) conditions.push(eq(tenders.analysisStatus, analysisStatus));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(tenders.title, pattern),
      ilike(tenders.organization, pattern),
      ilike(tenders.tenderNumber, pattern),
    ));
  }
  const where = and(...conditions);
  const sortColumn = SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.deadline;
  const orderFn = sortOrder === 'desc' ? desc : asc;
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safePage = Math.max(1, page);

  const [rows, [{ count }]] = await Promise.all([
    scope.db.select().from(tenders).where(where)
      .orderBy(orderFn(sortColumn))
      .limit(safeLimit).offset((safePage - 1) * safeLimit),
    scope.db.select({ count: sql`count(*)::int` }).from(tenders).where(where),
  ]);

  return { tenders: rows, total: count, page: safePage, limit: safeLimit };
}

/** Dashboard summary: aggregate counts plus a short recent/upcoming slice —
 *  the "what needs attention" answer, computed in one pass rather than
 *  reconstructed client-side from a paginated list (which only ever has one
 *  page in hand and can't produce a correct total). */
export async function getDashboardSummary(scope, { upcomingWithinDays = 14 } = {}) {
  const companyFilter = eq(tenders.companyId, scope.companyId);
  const deadlineCutoff = new Date(Date.now() + upcomingWithinDays * 24 * 60 * 60 * 1000);

  const [totals] = await scope.db
    .select({
      total: sql`count(*)::int`,
      processing: sql`count(*) filter (where ${tenders.processingStatus} in ('UPLOADED','PROCESSING','EXTRACTING'))::int`,
      awaitingAnalysis: sql`count(*) filter (where ${tenders.processingStatus} = 'COMPLETED' and ${tenders.analysisStatus} = 'NOT_STARTED')::int`,
      analysed: sql`count(*) filter (where ${tenders.analysisStatus} = 'COMPLETED')::int`,
      upcomingDeadlines: sql`count(*) filter (where ${tenders.submissionDeadline} is not null and ${tenders.submissionDeadline} between now() and ${deadlineCutoff})::int`,
    })
    .from(tenders)
    .where(companyFilter);

  const recentTenders = await scope.db
    .select({
      id: tenders.id,
      title: tenders.title,
      submissionDeadline: tenders.submissionDeadline,
      processingStatus: tenders.processingStatus,
      analysisStatus: tenders.analysisStatus,
    })
    .from(tenders)
    .where(companyFilter)
    .orderBy(desc(tenders.createdAt))
    .limit(5);

  return {
    totalTenders: totals.total,
    processing: totals.processing,
    awaitingAnalysis: totals.awaitingAnalysis,
    analysed: totals.analysed,
    upcomingDeadlines: { count: totals.upcomingDeadlines, withinDays: upcomingWithinDays },
    recentTenders,
  };
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
