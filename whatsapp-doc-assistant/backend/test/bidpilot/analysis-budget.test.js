// DB-backed (not in-memory) because this guards real spend, not just abuse —
// see budget.js's header for why that distinction matters here specifically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { eq } from 'drizzle-orm';
import {
  assertAnalysisBudget, recordChunkUsage, AnalysisBudgetError, claimTenderSlot, getAllowance,
} from '../../src/bidpilot/analysis/budget.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { subscriptions, usageRecords, tenders as tendersTable } from '../../src/db/schema/index.js';
import { config } from '../../src/config.js';

test('analysis budget guard', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  await t.test('a chunk count within both limits is allowed and consumes nothing on its own', async () => {
    const { company } = await createCompanyWithOwner(db, { companyName: 'C', userEmail: 'a@example.com', userName: 'A' });
    await assert.doesNotReject(() => assertAnalysisBudget(db, company.id, 5));
  });

  await t.test('a tender requiring more chunks than the per-tender cap is refused', async () => {
    const { company } = await createCompanyWithOwner(db, { companyName: 'C', userEmail: 'b@example.com', userName: 'B' });
    await assert.rejects(
      () => assertAnalysisBudget(db, company.id, config.bidpilot.analysis.maxChunksPerTender + 1),
      (err) => err instanceof AnalysisBudgetError && err.reason === 'tender_too_large',
    );
  });

  await t.test('exactly AT the per-tender cap is allowed (boundary, not off-by-one)', async () => {
    const { company } = await createCompanyWithOwner(db, { companyName: 'C', userEmail: 'c@example.com', userName: 'C' });
    await assert.doesNotReject(() => assertAnalysisBudget(db, company.id, config.bidpilot.analysis.maxChunksPerTender));
  });

  await t.test('recorded usage accumulates and eventually trips the per-company daily cap', async () => {
    const { company } = await createCompanyWithOwner(db, { companyName: 'C', userEmail: 'd@example.com', userName: 'D' });
    const limit = config.bidpilot.analysis.maxCallsPerCompanyPerDay;
    for (let i = 0; i < limit; i++) {
      await recordChunkUsage(db, { companyId: company.id, tenderId: null, metadata: null });
    }
    await assert.doesNotReject(() => assertAnalysisBudget(db, company.id, 0), 'exactly at the cap, 0 more is fine');
    await assert.rejects(
      () => assertAnalysisBudget(db, company.id, 1),
      (err) => err instanceof AnalysisBudgetError && err.reason === 'company_daily_cap',
    );
  });

  await t.test('usage is scoped per company — company A\'s heavy usage does not affect company B', async () => {
    const { company: companyA } = await createCompanyWithOwner(db, { companyName: 'A', userEmail: 'e@example.com', userName: 'E' });
    const { company: companyB } = await createCompanyWithOwner(db, { companyName: 'B', userEmail: 'f@example.com', userName: 'F' });
    for (let i = 0; i < config.bidpilot.analysis.maxCallsPerCompanyPerDay; i++) {
      await recordChunkUsage(db, { companyId: companyA.id, tenderId: null, metadata: null });
    }
    await assert.rejects(() => assertAnalysisBudget(db, companyA.id, 1));
    await assert.doesNotReject(() => assertAnalysisBudget(db, companyB.id, 1));
  });

  await t.test('usage older than 24h does not count against the rolling window', async () => {
    const { company } = await createCompanyWithOwner(db, { companyName: 'C', userEmail: 'g@example.com', userName: 'G' });
    const { usageRecords } = await import('../../src/db/schema/index.js');
    const oldRows = Array.from({ length: config.bidpilot.analysis.maxCallsPerCompanyPerDay }, () => ({
      companyId: company.id,
      kind: 'tender_analysis_chunk',
      quantity: 1,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
    }));
    await db.insert(usageRecords).values(oldRows);
    await assert.doesNotReject(() => assertAnalysisBudget(db, company.id, 5), 'old usage has rolled out of the window');
  });
});

test('free trial: first N different tenders per company', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);
  const limit = config.bidpilot.analysis.trialTenders;

  async function companyWithTenders(email, count) {
    const { user, company } = await createCompanyWithOwner(db, { companyName: 'Trial Co', userEmail: email, userName: 'T' });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tenders = [];
    for (let i = 0; i < count; i++) tenders.push(await createTender(scope, { title: `t${i}.pdf` }));
    return { company, tenders };
  }
  const trialExhausted = (err) => err instanceof AnalysisBudgetError && err.reason === 'trial_exhausted';

  await t.test('the default trial is 5 tenders', () => {
    assert.equal(limit, 5);
  });

  await t.test('N different tenders are allowed, the next one is refused, and re-running a counted one is free', async () => {
    const { company, tenders } = await companyWithTenders('trial-a@example.com', limit + 1);
    for (const tender of tenders.slice(0, limit)) await claimTenderSlot(db, company.id, tender.id);
    assert.deepEqual(await getAllowance(db, company.id), { kind: 'trial', limit, used: limit, remaining: 0 });
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[limit].id), trialExhausted);
    await assert.doesNotReject(() => claimTenderSlot(db, company.id, tenders[0].id), 're-run of a counted tender');
    assert.equal((await getAllowance(db, company.id)).used, limit, 're-runs never use another slot');
  });

  await t.test('deleting an analysed tender does not give its slot back', async () => {
    const { company, tenders } = await companyWithTenders('trial-b@example.com', limit + 1);
    for (const tender of tenders.slice(0, limit)) await claimTenderSlot(db, company.id, tender.id);
    await db.delete(tendersTable).where(eq(tendersTable.id, tenders[0].id));
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[limit].id), trialExhausted);
  });

  await t.test('two tenders racing for the last slot: exactly one gets it', async () => {
    const { company, tenders } = await companyWithTenders('trial-c@example.com', limit + 1);
    for (const tender of tenders.slice(0, limit - 1)) await claimTenderSlot(db, company.id, tender.id);
    const results = await Promise.allSettled([
      claimTenderSlot(db, company.id, tenders[limit - 1].id),
      claimTenderSlot(db, company.id, tenders[limit].id),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await getAllowance(db, company.id)).used, limit);
  });

  await t.test('the trial is per company', async () => {
    const a = await companyWithTenders('trial-d@example.com', limit);
    const b = await companyWithTenders('trial-e@example.com', 1);
    for (const tender of a.tenders) await claimTenderSlot(db, a.company.id, tender.id);
    await assert.doesNotReject(() => claimTenderSlot(db, b.company.id, b.tenders[0].id));
  });

  await t.test('an ACTIVE UNLIMITED subscription (internal accounts) has no limit', async () => {
    const { company, tenders } = await companyWithTenders('trial-f@example.com', limit + 1);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'UNLIMITED', status: 'ACTIVE' });
    for (const tender of tenders) await claimTenderSlot(db, company.id, tender.id);
    assert.equal(await getAllowance(db, company.id), null);
  });

  await t.test('an ACTIVE row without a sold plan or a period gives no plan: the trial still applies', async () => {
    const { company, tenders } = await companyWithTenders('trial-h@example.com', limit + 1);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'ACTIVE' });
    for (const tender of tenders.slice(0, limit)) await claimTenderSlot(db, company.id, tender.id);
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[limit].id), trialExhausted);
  });

  await t.test('a CANCELED latest subscription puts the trial limit back', async () => {
    const { company, tenders } = await companyWithTenders('trial-g@example.com', limit + 1);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'ACTIVE', periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 86_400_000 * 20), createdAt: new Date(Date.now() - 60_000) });
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'FREE', status: 'CANCELED' });
    for (const tender of tenders.slice(0, limit)) await claimTenderSlot(db, company.id, tender.id);
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[limit].id), trialExhausted);
  });
});

test('monthly plans: N new tenders per period', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);
  const DAY = 86_400_000;
  const reason = (r) => (err) => err instanceof AnalysisBudgetError && err.reason === r;

  async function companyOnPlan(email, count, plan, { startDaysAgo = 3, lengthDays = 30 } = {}) {
    const { user, company } = await createCompanyWithOwner(db, { companyName: 'Plan Co', userEmail: email, userName: 'P' });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tenders = [];
    for (let i = 0; i < count; i++) tenders.push(await createTender(scope, { title: `p${i}.pdf` }));
    const periodStart = new Date(Date.now() - startDaysAgo * DAY);
    await db.insert(subscriptions).values({ companyId: company.id, plan, status: 'ACTIVE', periodStart, periodEnd: new Date(periodStart.getTime() + lengthDays * DAY) });
    return { company, tenders };
  }

  await t.test('Starter allows 10 new tenders in the period, then plan_exhausted; re-runs are free', async () => {
    const { company, tenders } = await companyOnPlan('plan-a@example.com', 11, 'STARTER');
    for (const tender of tenders.slice(0, 10)) await claimTenderSlot(db, company.id, tender.id);
    const a = await getAllowance(db, company.id);
    assert.equal(a.kind, 'plan');
    assert.equal(a.planName, 'Starter');
    assert.deepEqual([a.limit, a.used, a.remaining], [10, 10, 0]);
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[10].id), reason('plan_exhausted'));
    await assert.doesNotReject(() => claimTenderSlot(db, company.id, tenders[0].id));
  });

  await t.test('the plan ignores the free trial: a firm that used its 5 free tenders still gets the full plan', async () => {
    const { company, tenders } = await companyOnPlan('plan-b@example.com', 20, 'GROWTH');
    await db.insert(usageRecords).values(Array.from({ length: 5 }, () => ({ companyId: company.id, kind: 'trial_tender', quantity: 1 })));
    for (const tender of tenders.slice(0, 15)) await claimTenderSlot(db, company.id, tender.id);
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[15].id), reason('plan_exhausted'));
    assert.equal((await getAllowance(db, company.id)).limit, 15);
  });

  await t.test('a tender first analysed on the trial re-runs free on the plan', async () => {
    const { company, tenders } = await companyOnPlan('plan-c@example.com', 1, 'PRO');
    await db.insert(usageRecords).values({ companyId: company.id, tenderId: tenders[0].id, kind: 'trial_tender', quantity: 1 });
    await claimTenderSlot(db, company.id, tenders[0].id);
    assert.equal((await getAllowance(db, company.id)).used, 0);
  });

  await t.test('a new period starts the count again', async () => {
    const { company, tenders } = await companyOnPlan('plan-d@example.com', 12, 'STARTER', { startDaysAgo: 40, lengthDays: 30 });
    // Last period's 10, recorded inside last period.
    await db.insert(usageRecords).values(Array.from({ length: 10 }, () => ({ companyId: company.id, kind: 'plan_tender', quantity: 1, createdAt: new Date(Date.now() - 35 * DAY) })));
    const prev = await db.select().from(subscriptions);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'STARTER', status: 'ACTIVE', periodStart: prev[0].periodEnd, periodEnd: new Date(prev[0].periodEnd.getTime() + 30 * DAY) });
    const a = await getAllowance(db, company.id);
    assert.deepEqual([a.kind, a.used, a.remaining], ['plan', 0, 10]);
    await assert.doesNotReject(() => claimTenderSlot(db, company.id, tenders[0].id));
  });

  await t.test('renewing early keeps the current period until it ends', async () => {
    const { company } = await companyOnPlan('plan-e@example.com', 0, 'GROWTH', { startDaysAgo: 25, lengthDays: 30 });
    const [cur] = await db.select().from(subscriptions);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'ACTIVE', periodStart: cur.periodEnd, periodEnd: new Date(cur.periodEnd.getTime() + 30 * DAY) });
    const a = await getAllowance(db, company.id);
    assert.equal(a.kind, 'plan');
    assert.equal(a.periodEnd.getTime(), cur.periodEnd.getTime());
  });

  await t.test('an ended plan refuses new tenders with plan_expired, and still re-runs counted ones', async () => {
    const { company, tenders } = await companyOnPlan('plan-f@example.com', 2, 'PRO', { startDaysAgo: 40, lengthDays: 30 });
    await db.insert(usageRecords).values({ companyId: company.id, tenderId: tenders[0].id, kind: 'plan_tender', quantity: 1, createdAt: new Date(Date.now() - 35 * DAY) });
    assert.equal((await getAllowance(db, company.id)).kind, 'plan_expired');
    await assert.rejects(() => claimTenderSlot(db, company.id, tenders[1].id), (err) => reason('plan_expired')(err) && /Pro plan ended on/.test(err.message));
    await assert.doesNotReject(() => claimTenderSlot(db, company.id, tenders[0].id));
  });

  await t.test('two tenders racing for the last plan slot: exactly one gets it', async () => {
    const { company, tenders } = await companyOnPlan('plan-g@example.com', 11, 'STARTER');
    for (const tender of tenders.slice(0, 9)) await claimTenderSlot(db, company.id, tender.id);
    const results = await Promise.allSettled([claimTenderSlot(db, company.id, tenders[9].id), claimTenderSlot(db, company.id, tenders[10].id)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  });
});
