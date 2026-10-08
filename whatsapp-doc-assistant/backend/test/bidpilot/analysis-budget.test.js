// DB-backed (not in-memory) because this guards real spend, not just abuse —
// see budget.js's header for why that distinction matters here specifically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { eq } from 'drizzle-orm';
import {
  assertAnalysisBudget, recordChunkUsage, AnalysisBudgetError, claimTrialTender, getTrialStatus,
} from '../../src/bidpilot/analysis/budget.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { subscriptions, tenders as tendersTable } from '../../src/db/schema/index.js';
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
    for (const tender of tenders.slice(0, limit)) await claimTrialTender(db, company.id, tender.id);
    assert.deepEqual(await getTrialStatus(db, company.id), { limit, used: limit, remaining: 0 });
    await assert.rejects(() => claimTrialTender(db, company.id, tenders[limit].id), trialExhausted);
    await assert.doesNotReject(() => claimTrialTender(db, company.id, tenders[0].id), 're-run of a counted tender');
    assert.equal((await getTrialStatus(db, company.id)).used, limit, 're-runs never use another slot');
  });

  await t.test('deleting an analysed tender does not give its slot back', async () => {
    const { company, tenders } = await companyWithTenders('trial-b@example.com', limit + 1);
    for (const tender of tenders.slice(0, limit)) await claimTrialTender(db, company.id, tender.id);
    await db.delete(tendersTable).where(eq(tendersTable.id, tenders[0].id));
    await assert.rejects(() => claimTrialTender(db, company.id, tenders[limit].id), trialExhausted);
  });

  await t.test('two tenders racing for the last slot: exactly one gets it', async () => {
    const { company, tenders } = await companyWithTenders('trial-c@example.com', limit + 1);
    for (const tender of tenders.slice(0, limit - 1)) await claimTrialTender(db, company.id, tender.id);
    const results = await Promise.allSettled([
      claimTrialTender(db, company.id, tenders[limit - 1].id),
      claimTrialTender(db, company.id, tenders[limit].id),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await getTrialStatus(db, company.id)).used, limit);
  });

  await t.test('the trial is per company', async () => {
    const a = await companyWithTenders('trial-d@example.com', limit);
    const b = await companyWithTenders('trial-e@example.com', 1);
    for (const tender of a.tenders) await claimTrialTender(db, a.company.id, tender.id);
    await assert.doesNotReject(() => claimTrialTender(db, b.company.id, b.tenders[0].id));
  });

  await t.test('a company whose latest subscription is ACTIVE has no trial limit', async () => {
    const { company, tenders } = await companyWithTenders('trial-f@example.com', limit + 1);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'ACTIVE' });
    for (const tender of tenders) await claimTrialTender(db, company.id, tender.id);
    assert.equal(await getTrialStatus(db, company.id), null);
  });

  await t.test('a CANCELED latest subscription puts the trial limit back', async () => {
    const { company, tenders } = await companyWithTenders('trial-g@example.com', limit + 1);
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'ACTIVE', createdAt: new Date(Date.now() - 60_000) });
    await db.insert(subscriptions).values({ companyId: company.id, plan: 'GROWTH', status: 'CANCELED' });
    for (const tender of tenders.slice(0, limit)) await claimTrialTender(db, company.id, tender.id);
    await assert.rejects(() => claimTrialTender(db, company.id, tenders[limit].id), trialExhausted);
  });
});
