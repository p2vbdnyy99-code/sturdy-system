// AI analysis spend control — deliberately DB-backed (usage_records), not an
// in-memory limiter like loginRateLimit.js/uploadLock.js.
// -----------------------------------------------------------------------------
// Those in-memory limiters protect against ABUSE (a plausible-enough, best-
// effort guard for a single-instance deployment is fine). This protects
// REAL MONEY — it must stay accurate across a restart and, later, across
// multiple instances, so it reads its own prior spend back from Postgres
// before allowing more. Both limits are configurable (config.bidpilot.analysis),
// never hardcoded.

import { and, eq, gte, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { usageRecords } from '../../db/schema/index.js';

export const USAGE_KIND = 'tender_analysis_chunk';

export class AnalysisBudgetError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'AnalysisBudgetError';
    this.reason = reason; // 'tender_too_large' | 'company_daily_cap'
  }
}

/**
 * Throws AnalysisBudgetError if starting an analysis of `chunkCount` chunks
 * would exceed either cap. Callers MUST check this before spending anything
 * — it does not itself consume budget (see recordChunkUsage, called per
 * actual AI call as analysis proceeds).
 */
export async function assertAnalysisBudget(db, companyId, chunkCount) {
  const { maxChunksPerTender, maxCallsPerCompanyPerDay } = config.bidpilot.analysis;

  if (chunkCount > maxChunksPerTender) {
    throw new AnalysisBudgetError(
      `This tender would require ${chunkCount} analysis calls, over the limit of ${maxChunksPerTender}. ` +
        'It is too large to analyze in this beta.',
      'tender_too_large',
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ used: sql`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.companyId, companyId),
      eq(usageRecords.kind, USAGE_KIND),
      gte(usageRecords.createdAt, since),
    ));
  const used = Number(row?.used || 0);

  if (used + chunkCount > maxCallsPerCompanyPerDay) {
    throw new AnalysisBudgetError(
      `This company has used ${used}/${maxCallsPerCompanyPerDay} analysis calls in the last 24h. ` +
        `This analysis (${chunkCount} calls) would exceed that limit.`,
      'company_daily_cap',
    );
  }
}

/** Record actual spend for one chunk call — write this AFTER each real AI
 *  call succeeds, not upfront, so a failed/skipped chunk doesn't count
 *  against the company's budget. */
export async function recordChunkUsage(db, { companyId, tenderId, metadata }) {
  await db.insert(usageRecords).values({
    companyId,
    tenderId,
    kind: USAGE_KIND,
    quantity: 1,
    metadata: metadata || null,
  });
}
