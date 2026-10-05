// AI analysis spend control — deliberately DB-backed (usage_records), not an
// in-memory limiter like loginRateLimit.js/uploadLock.js.
// -----------------------------------------------------------------------------
// Those in-memory limiters protect against ABUSE (a plausible-enough, best-
// effort guard for a single-instance deployment is fine). This protects
// REAL MONEY — it must stay accurate across a restart and, later, across
// multiple instances, so it reads its own prior spend back from Postgres
// before allowing more. Both limits are configurable (config.bidpilot.analysis),
// never hardcoded.

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { subscriptions, usageRecords } from '../../db/schema/index.js';

export const USAGE_KIND = 'tender_analysis_chunk';

export class AnalysisBudgetError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'AnalysisBudgetError';
    this.reason = reason; // 'tender_too_large' | 'company_daily_cap' | 'trial_exhausted'
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

// ─── Free trial: the first N different tenders per company ─────────────────
// One usage row per tender, written when that tender's first analysis
// starts. Counting these rows (not tenders) means deleting an analysed
// tender doesn't hand the slot back: the row survives with tender_id set to
// null. Re-running a tender that already has a row is free, so a failed
// analysis can be retried without using another slot. A company whose
// latest subscription is ACTIVE (a paid plan) has no trial limit.

export const TRIAL_USAGE_KIND = 'trial_tender';

async function hasActivePlan(db, companyId) {
  const [latest] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.companyId, companyId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return latest?.status === 'ACTIVE';
}

async function countTrialTenders(db, companyId) {
  const [row] = await db
    .select({ used: sql`count(*)::int` })
    .from(usageRecords)
    .where(and(eq(usageRecords.companyId, companyId), eq(usageRecords.kind, TRIAL_USAGE_KIND)));
  return Number(row?.used || 0);
}

/** For the dashboard. null when the company has no trial limit (paid plan,
 *  or the limit is switched off). */
export async function getTrialStatus(db, companyId) {
  const limit = config.bidpilot.analysis.trialTenders;
  if (!limit || await hasActivePlan(db, companyId)) return null;
  const used = Math.min(limit, await countTrialTenders(db, companyId));
  return { limit, used, remaining: limit - used };
}

/**
 * Takes a trial slot for this tender, or confirms it already has one.
 * Throws AnalysisBudgetError('trial_exhausted') when every slot is used.
 * Runs under a row lock on the company, so two Analyze clicks on different
 * tenders at 4/5 can't both get the last slot.
 */
export async function claimTrialTender(db, companyId, tenderId) {
  const limit = config.bidpilot.analysis.trialTenders;
  if (!limit) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from companies where id = ${companyId} for update`);
    if (await hasActivePlan(tx, companyId)) return;
    const [already] = await tx
      .select({ id: usageRecords.id })
      .from(usageRecords)
      .where(and(
        eq(usageRecords.companyId, companyId),
        eq(usageRecords.kind, TRIAL_USAGE_KIND),
        eq(usageRecords.tenderId, tenderId),
      ))
      .limit(1);
    if (already) return;
    if (await countTrialTenders(tx, companyId) >= limit) {
      throw new AnalysisBudgetError(
        `Your free trial covers ${limit} tenders, and all ${limit} have been used. ` +
          'Tenders you have already analysed can still be re-run. To analyse new tenders, please contact us about a paid plan.',
        'trial_exhausted',
      );
    }
    await tx.insert(usageRecords).values({ companyId, tenderId, kind: TRIAL_USAGE_KIND, quantity: 1 });
  });
}

// ─── Eligibility checks — a separate cost center from analysis above ───────

export const ELIGIBILITY_USAGE_KIND = 'tender_eligibility_check';

/** Always exactly one AI call per eligibility run (unlike analysis, which is
 *  chunked) — no per-tender size cap needed, just the daily company cap. */
export async function assertEligibilityBudget(db, companyId) {
  const { maxCallsPerCompanyPerDay } = config.bidpilot.eligibility;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ used: sql`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.companyId, companyId),
      eq(usageRecords.kind, ELIGIBILITY_USAGE_KIND),
      gte(usageRecords.createdAt, since),
    ));
  const used = Number(row?.used || 0);

  if (used + 1 > maxCallsPerCompanyPerDay) {
    throw new AnalysisBudgetError(
      `This company has used ${used}/${maxCallsPerCompanyPerDay} eligibility checks in the last 24h.`,
      'company_daily_cap',
    );
  }
}

export async function recordEligibilityUsage(db, { companyId, tenderId, metadata }) {
  await db.insert(usageRecords).values({
    companyId,
    tenderId,
    kind: ELIGIBILITY_USAGE_KIND,
    quantity: 1,
    metadata: metadata || null,
  });
}
