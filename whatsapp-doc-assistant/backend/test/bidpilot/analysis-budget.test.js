// DB-backed (not in-memory) because this guards real spend, not just abuse —
// see budget.js's header for why that distinction matters here specifically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { assertAnalysisBudget, recordChunkUsage, AnalysisBudgetError } from '../../src/bidpilot/analysis/budget.js';
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
