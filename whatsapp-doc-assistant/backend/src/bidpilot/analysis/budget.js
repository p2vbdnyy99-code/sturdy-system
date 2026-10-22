// AI analysis spend control — deliberately DB-backed (usage_records), not an
// in-memory limiter like loginRateLimit.js/uploadLock.js.
// -----------------------------------------------------------------------------
// Those in-memory limiters protect against ABUSE (a plausible-enough, best-
// effort guard for a single-instance deployment is fine). This protects
// REAL MONEY — it must stay accurate across a restart and, later, across
// multiple instances, so it reads its own prior spend back from Postgres
// before allowing more. Both limits are configurable (config.bidpilot.analysis),
// never hardcoded.

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { subscriptions, usageRecords } from '../../db/schema/index.js';
import { planFor, UNLIMITED_PLAN } from '../plans.js';

export const USAGE_KIND = 'tender_analysis_chunk';

export class AnalysisBudgetError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'AnalysisBudgetError';
    this.reason = reason; // 'tender_too_large' | 'company_daily_cap' | 'trial_exhausted' | 'plan_exhausted' | 'plan_expired'
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

// ─── Tender allowance: free trial or monthly plan ──────────────────────────
// One usage row per tender, written when that tender's first analysis
// starts: 'trial_tender' on the free trial, 'plan_tender' on a monthly plan.
// Counting rows (not tenders) means deleting an analysed tender doesn't hand
// its slot back: the row survives with tender_id set to null. Re-running a
// tender that already has a row of either kind is free, so a failed analysis
// can be retried without using another slot.
//
// What a company gets comes from its subscriptions (latest row wins):
//   - latest row ACTIVE with plan UNLIMITED: no limit (internal use only);
//   - an ACTIVE row for a sold plan (plans.js) whose period includes now, and
//     no CANCELED/other row after it: that plan's tenders in that period;
//   - latest row ACTIVE for a sold plan whose period has ended: 'plan_expired'
//     (new tenders refused until renewed);
//   - anything else: the free trial (BIDPILOT_TRIAL_TENDERS, all time).

export const TRIAL_USAGE_KIND = 'trial_tender';
export const PLAN_USAGE_KIND = 'plan_tender';

const formatDay = (d) => new Date(d).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});

/** The company's entitlement right now. */
export async function getEntitlement(db, companyId, now = new Date()) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.companyId, companyId))
    .orderBy(desc(subscriptions.createdAt));
  const [latest] = rows;
  if (latest?.status === 'ACTIVE') {
    if (latest.plan === UNLIMITED_PLAN) return { kind: 'unlimited' };
    // Newest first, stopping at the first row that isn't ACTIVE: a
    // cancellation ends everything before it.
    for (const row of rows) {
      if (row.status !== 'ACTIVE') break;
      const plan = planFor(row.plan);
      if (plan && row.periodStart && row.periodEnd && row.periodStart <= now && now < row.periodEnd) {
        return { kind: 'plan', planName: plan.name, limit: plan.tendersPerMonth, periodStart: row.periodStart, periodEnd: row.periodEnd };
      }
    }
    const plan = planFor(latest.plan);
    if (plan && latest.periodEnd && latest.periodEnd <= now) {
      return { kind: 'plan_expired', planName: plan.name, periodEnd: latest.periodEnd };
    }
  }
  const limit = config.bidpilot.analysis.trialTenders;
  return limit ? { kind: 'trial', limit } : { kind: 'unlimited' };
}

async function countUsed(db, companyId, entitlement) {
  const where = entitlement.kind === 'plan'
    ? and(
      eq(usageRecords.companyId, companyId),
      eq(usageRecords.kind, PLAN_USAGE_KIND),
      gte(usageRecords.createdAt, entitlement.periodStart),
      lt(usageRecords.createdAt, entitlement.periodEnd),
    )
    : and(eq(usageRecords.companyId, companyId), eq(usageRecords.kind, TRIAL_USAGE_KIND));
  const [row] = await db.select({ used: sql`count(*)::int` }).from(usageRecords).where(where);
  return Number(row?.used || 0);
}

/** For the dashboard. null when the company has no limit. */
export async function getAllowance(db, companyId) {
  const ent = await getEntitlement(db, companyId);
  if (ent.kind === 'unlimited') return null;
  if (ent.kind === 'plan_expired') {
    return { kind: 'plan_expired', planName: ent.planName, limit: 0, used: 0, remaining: 0, periodEnd: ent.periodEnd };
  }
  const used = Math.min(ent.limit, await countUsed(db, companyId, ent));
  return {
    kind: ent.kind,
    ...(ent.kind === 'plan' ? { planName: ent.planName, periodEnd: ent.periodEnd } : {}),
    limit: ent.limit,
    used,
    remaining: ent.limit - used,
  };
}

/**
 * Takes a slot (trial or this month's plan) for this tender, or confirms it
 * already has one. Throws AnalysisBudgetError with reason 'trial_exhausted',
 * 'plan_exhausted' or 'plan_expired'. Runs under a row lock on the company,
 * so two Analyze clicks on different tenders can't both take the last slot.
 */
export async function claimTenderSlot(db, companyId, tenderId) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from companies where id = ${companyId} for update`);
    const ent = await getEntitlement(tx, companyId);
    if (ent.kind === 'unlimited') return;
    const [already] = await tx
      .select({ id: usageRecords.id })
      .from(usageRecords)
      .where(and(
        eq(usageRecords.companyId, companyId),
        inArray(usageRecords.kind, [TRIAL_USAGE_KIND, PLAN_USAGE_KIND]),
        eq(usageRecords.tenderId, tenderId),
      ))
      .limit(1);
    if (already) return;
    const rerun = 'Tenders you have already analysed can still be re-run.';
    if (ent.kind === 'plan_expired') {
      throw new AnalysisBudgetError(
        `Your ${ent.planName} plan ended on ${formatDay(ent.periodEnd)}. ${rerun} To analyse new tenders, please contact us to renew.`,
        'plan_expired',
      );
    }
    if (await countUsed(tx, companyId, ent) >= ent.limit) {
      if (ent.kind === 'plan') {
        throw new AnalysisBudgetError(
          `Your ${ent.planName} plan includes ${ent.limit} tenders a month, and all ${ent.limit} have been used in the period `
            + `ending ${formatDay(ent.periodEnd)}. ${rerun} For more tenders this month, please contact us about a bigger plan.`,
          'plan_exhausted',
        );
      }
      throw new AnalysisBudgetError(
        `Your free trial covers ${ent.limit} tenders, and all ${ent.limit} have been used. `
          + `${rerun} To analyse new tenders, please contact us about a paid plan.`,
        'trial_exhausted',
      );
    }
    await tx.insert(usageRecords).values({
      companyId, tenderId, kind: ent.kind === 'plan' ? PLAN_USAGE_KIND : TRIAL_USAGE_KIND, quantity: 1,
    });
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

// ─── Annexure drafts — one AI call per draft, their own daily cap ──────────

export const ANNEXURE_USAGE_KIND = 'tender_annexure_draft';

export async function assertAnnexureBudget(db, companyId) {
  const { maxDraftsPerCompanyPerDay } = config.bidpilot.annexures;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ used: sql`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.companyId, companyId),
      eq(usageRecords.kind, ANNEXURE_USAGE_KIND),
      gte(usageRecords.createdAt, since),
    ));
  const used = Number(row?.used || 0);
  if (used + 1 > maxDraftsPerCompanyPerDay) {
    throw new AnalysisBudgetError(
      `This company has drafted ${used}/${maxDraftsPerCompanyPerDay} annexures in the last 24 hours. Try again tomorrow.`,
      'company_daily_cap',
    );
  }
}

export async function recordAnnexureUsage(db, { companyId, tenderId, metadata }) {
  await db.insert(usageRecords).values({
    companyId,
    tenderId,
    kind: ANNEXURE_USAGE_KIND,
    quantity: 1,
    metadata: metadata || null,
  });
}
