// Startup recovery (src/bidpilot/recovery.js): a restart mid-analysis or
// mid-extraction must not leave a tender permanently stuck. Production QA
// (1 Oct 2026) reproduced exactly that: re-analyze answered 409 forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { dbAvailable, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, getTender, startAnalysis } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence, listRequirements } from '../../src/bidpilot/repo/requirements.js';
import { tenders, tenderEvents } from '../../src/db/schema/index.js';
import {
  recoverInterruptedWork, INTERRUPTED_ANALYSIS_MESSAGE, INTERRUPTED_PROCESSING_MESSAGE,
} from '../../src/bidpilot/recovery.js';

test('recoverInterruptedWork', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);

  let scope;
  t.beforeEach(async () => {
    await truncateAll();
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Recovery Co', userEmail: 'recovery@example.com', userName: 'R',
    });
    scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
  });

  async function tenderWith(status) {
    const tender = await createTender(scope, { title: 'x.pdf' });
    await db.update(tenders).set(status).where(eq(tenders.id, tender.id));
    return tender;
  }

  await t.test('interrupted analysis becomes FAILED with a retry message, and can be re-run', async () => {
    const tender = await tenderWith({ processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING' });
    const result = await recoverInterruptedWork(db);
    assert.deepEqual(result, { analyses: 1, processing: 0 });

    const after = await getTender(scope, tender.id);
    assert.equal(after.analysisStatus, 'FAILED');
    assert.equal(after.analysisError, INTERRUPTED_ANALYSIS_MESSAGE);
    // The 409 production QA hit: before recovery startAnalysis refused; now it wins.
    assert.ok(await startAnalysis(scope, tender.id), 're-analysis is no longer blocked');
  });

  await t.test('an interrupted RE-analysis keeps the previous analysis data', async () => {
    const tender = await tenderWith({ processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING' });
    await createRequirementWithEvidence(
      scope, tender.id,
      { category: 'FINANCIAL', title: 'Turnover', description: 'Turnover >= 1 crore', mandatory: true },
      [{ sourcePage: 1, evidenceText: 'quoted' }],
    );
    await recoverInterruptedWork(db);
    assert.equal((await listRequirements(scope, tender.id)).length, 1);
  });

  await t.test('every in-flight extraction state becomes FAILED with a re-upload message', async () => {
    const ids = [];
    for (const processingStatus of ['UPLOADED', 'PROCESSING', 'EXTRACTING']) {
      ids.push((await tenderWith({ processingStatus })).id);
    }
    const result = await recoverInterruptedWork(db);
    assert.deepEqual(result, { analyses: 0, processing: 3 });
    for (const id of ids) {
      const after = await getTender(scope, id);
      assert.equal(after.processingStatus, 'FAILED');
      assert.equal(after.processingError, INTERRUPTED_PROCESSING_MESSAGE);
    }
  });

  await t.test('finished, failed, and never-analyzed tenders are left alone', async () => {
    const done = await tenderWith({ processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED' });
    const notStarted = await tenderWith({ processingStatus: 'COMPLETED', analysisStatus: 'NOT_STARTED' });
    const failed = await tenderWith({ processingStatus: 'FAILED', processingError: 'Not a PDF' });

    assert.deepEqual(await recoverInterruptedWork(db), { analyses: 0, processing: 0 });
    assert.equal((await getTender(scope, done.id)).analysisStatus, 'COMPLETED');
    assert.equal((await getTender(scope, notStarted.id)).analysisStatus, 'NOT_STARTED');
    assert.equal((await getTender(scope, failed.id)).processingError, 'Not a PDF');
  });

  await t.test('writes an activity event per recovered tender, and is idempotent', async () => {
    const a = await tenderWith({ processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING' });
    const p = await tenderWith({ processingStatus: 'EXTRACTING' });
    await recoverInterruptedWork(db);

    const events = await db.select().from(tenderEvents);
    assert.deepEqual(
      events.map((e) => [e.tenderId, e.eventType]).sort(),
      [[a.id, 'analysis_interrupted'], [p.id, 'processing_interrupted']].sort(),
    );
    assert.deepEqual(await recoverInterruptedWork(db), { analyses: 0, processing: 0 });
    assert.equal((await db.select().from(tenderEvents)).length, 2, 'second pass writes nothing');
  });
});
