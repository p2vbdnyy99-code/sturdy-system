// Milestone 4 — the analysis persistence layer and the /analyze route, over
// real Postgres. The AI provider is ALWAYS mocked (setProvider) — no real
// OpenAI/Anthropic call is ever made in this suite; extract.js's own prompt
// framing is covered separately in analysis-security.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, getTender, updateProcessingStatus } from '../../src/bidpilot/repo/tenders.js';
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { listRequirements, listEvidenceForRequirement } from '../../src/bidpilot/repo/requirements.js';
import { listDates } from '../../src/bidpilot/repo/dates.js';
import { listRedFlags } from '../../src/bidpilot/repo/redFlags.js';
import { replaceAnalysis, markAnalysisFailed } from '../../src/bidpilot/repo/analysis.js';
import { runAnalysis, safeErrorMessage } from '../../src/bidpilot/analysis/pipeline.js';
import { setProvider } from '../../src/ai/index.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { tenderEvents, tenderBoqItems } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { config } from '../../src/config.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

function mockValidResult({ organization, requirementCount = 1 } = {}) {
  return JSON.stringify({
    overview: organization ? { organization: { value: organization, sourcePage: 1, evidenceText: 'q' } } : {},
    requirements: Array.from({ length: requirementCount }, (_, i) => ({
      category: 'FINANCIAL', title: `Requirement ${i + 1}`, description: `Description ${i + 1}`,
      mandatory: true, sourcePage: 1, evidenceText: 'quoted evidence', extractedValue: 'Rs 5 crore', confidence: 0.9,
    })),
    boq: [{ description: 'Cement bags', sourcePage: 1 }],
    dates: [{ label: 'Pre-bid meeting', rawText: '12 Oct 2026', sourcePage: 1, evidenceText: 'q' }],
    redFlags: [{ description: 'One-sided termination clause', sourcePage: 1, evidenceText: 'q' }],
  });
}

// ── Repo-level: replaceAnalysis persistence behavior ────────────────────────

test('replaceAnalysis (repo-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  async function setupTender() {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Repo Test Co', userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x.pdf' });
    await insertPages(scope, tender.id, [{ pageNumber: 1, rawText: 'Some tender text on page one.', ocrUsed: false }]);
    return { scope, tender };
  }

  await t.test('persists overview, requirements+evidence, BOQ, dates, and red flags in one go', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return mockValidResult({ organization: 'Acme' }); } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });

    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'COMPLETED');
    assert.equal(updated.organization, 'Acme');
    assert.deepEqual(updated.overviewEvidence.organization, { sourcePage: 1, evidenceText: 'q' });

    const reqs = await listRequirements(scope, tender.id);
    assert.equal(reqs.length, 1);
    const evidence = await listEvidenceForRequirement(scope, reqs[0].id);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].sourcePage, 1);

    const boq = await scope.db.select().from(tenderBoqItems).where(eq(tenderBoqItems.tenderId, tender.id));
    assert.equal(boq.length, 1);
    const dates = await listDates(scope, tender.id);
    assert.equal(dates.length, 1);
    const flags = await listRedFlags(scope, tender.id);
    assert.equal(flags.length, 1);
  });

  // tender_boq_items.quantity is numeric: one quantity written the way Indian
  // BOQs write it used to throw inside replaceAnalysis and fail the whole run.
  await t.test('real-world BOQ quantities are stored, not fatal to the analysis', async () => {
    const { scope, tender } = await setupTender();
    setProvider({
      name: 'mock',
      async complete() {
        return JSON.stringify({
          boq: [
            { itemNumber: '1', description: 'Plastering', quantity: '2,150', unit: 'sqm', sourcePage: 1 },
            { itemNumber: '2', description: 'Earthwork', quantity: '1,27,300.50', unit: 'cum', sourcePage: 1 },
            { itemNumber: '3', description: 'Main gate', quantity: '1 No.', sourcePage: 1 },
            { itemNumber: '4', description: 'Shifting of services', quantity: 'LS', sourcePage: 1 },
            { itemNumber: '5', description: 'Dewatering', quantity: 'As required', remarks: 'If needed', sourcePage: 1 },
          ],
        });
      },
    });
    await runAnalysis(scope, tender.id, { isReanalysis: false });

    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'COMPLETED', updated.analysisError ?? '');
    const boq = await scope.db.select().from(tenderBoqItems).where(eq(tenderBoqItems.tenderId, tender.id));
    const byItem = Object.fromEntries(boq.map((b) => [b.itemNumber, b]));
    assert.equal(Number(byItem['1'].quantity), 2150);
    assert.equal(Number(byItem['2'].quantity), 127300.5);
    assert.equal(Number(byItem['3'].quantity), 1);
    assert.equal(byItem['3'].unit, 'No.');
    assert.equal(byItem['4'].quantity, null);
    assert.equal(byItem['4'].remarks, 'Quantity as written: LS');
    assert.equal(byItem['5'].quantity, null);
    assert.equal(byItem['5'].remarks, 'If needed; quantity as written: As required');
  });

  await t.test('re-analysis REPLACES, never duplicates', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return mockValidResult({ requirementCount: 2 }); } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    assert.equal((await listRequirements(scope, tender.id)).length, 2);

    setProvider({ name: 'mock2', async complete() { return mockValidResult({ requirementCount: 1 }); } });
    await runAnalysis(scope, tender.id, { isReanalysis: true });
    const after = await listRequirements(scope, tender.id);
    assert.equal(after.length, 1, 'replaced, not appended (would be 3 if duplicated)');
  });

  await t.test('a FAILED re-analysis leaves the previous COMPLETED analysis data completely untouched', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return mockValidResult(); } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const before = await listRequirements(scope, tender.id);
    assert.equal(before.length, 1);

    setProvider({ name: 'mock-fail', async complete() { throw new Error('provider outage'); } });
    await runAnalysis(scope, tender.id, { isReanalysis: true });

    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'FAILED');
    assert.ok(updated.analysisError);
    const after = await listRequirements(scope, tender.id);
    assert.equal(after.length, 1, 'the prior successful data was never deleted');
  });

  await t.test('a tender_events row records completion, distinguishing first analysis from a replace', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return mockValidResult(); } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    await runAnalysis(scope, tender.id, { isReanalysis: true });

    const events = await scope.db.select().from(tenderEvents).where(eq(tenderEvents.tenderId, tender.id));
    const types = events.map((e) => e.eventType);
    assert.ok(types.includes('analysis_completed'));
    assert.ok(types.includes('analysis_replaced'));
  });

  await t.test('markAnalysisFailed never touches existing requirement/BOQ/date/red-flag rows', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return mockValidResult(); } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    await markAnalysisFailed(scope, tender.id, 'manual failure for this test');
    assert.equal((await listRequirements(scope, tender.id)).length, 1);
    assert.equal((await listDates(scope, tender.id)).length, 1);
  });

  await t.test('a chunk producing NOTHING usable (all dropped) still completes with empty results, not a crash', async () => {
    const { scope, tender } = await setupTender();
    // Valid JSON, but every requirement is missing evidence — schema.js drops all of them.
    setProvider({ name: 'mock', async complete() {
      return JSON.stringify({ requirements: [{ category: 'OTHER', description: 'x' }] });
    } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'COMPLETED');
    assert.equal((await listRequirements(scope, tender.id)).length, 0);
  });

  await t.test('a provider that returns unparseable garbage for the ONLY chunk marks the analysis FAILED', async () => {
    const { scope, tender } = await setupTender();
    setProvider({ name: 'mock', async complete() { return 'not json at all, sorry'; } });
    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'FAILED');
  });

  // ── Beta Readiness: bounded concurrency (pipeline.js's worker pool) ──────

  // Like mockValidResult(), but sourcePage matches the given page — needed
  // once a tender has more than one chunk, since validateChunkResult() drops
  // any evidence citing a page outside that specific chunk (see schema.js's
  // validPages check) and mockValidResult() alone always hardcodes page 1.
  function mockResultForPage(pageNumber, { organization, requirementCount = 1 } = {}) {
    return JSON.stringify({
      overview: organization ? { organization: { value: organization, sourcePage: pageNumber, evidenceText: 'q' } } : {},
      requirements: Array.from({ length: requirementCount }, (_, i) => ({
        category: 'FINANCIAL', title: `Requirement ${i + 1}`, description: `Description ${i + 1}`,
        mandatory: true, sourcePage: pageNumber, evidenceText: 'quoted evidence', extractedValue: 'Rs 5 crore', confidence: 0.9,
      })),
    });
  }

  await t.test('aggregation follows CHUNK order, not AI-call completion order, under concurrency', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Concurrency Test Co', userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'concurrency.pdf' });
    // Each page alone exceeds the chunk budget, so chunker.js gives each its
    // own chunk (same trick the 413 test above uses) — three chunks whose
    // document order is 1, 2, 3.
    const bigText = (label) => `${label} ` + 'x'.repeat(config.bidpilot.analysis.chunkChars + 1000);
    await insertPages(scope, tender.id, [
      { pageNumber: 1, rawText: bigText('first'), ocrUsed: false },
      { pageNumber: 2, rawText: bigText('second'), ocrUsed: false },
      { pageNumber: 3, rawText: bigText('third'), ocrUsed: false },
    ]);

    // Chunk 1's call is the SLOWEST to resolve, chunk 3's the fastest — so
    // completion order is 3, 2, 1, the reverse of document order. If the
    // worker pool pushed results in completion order instead of writing them
    // to a pre-sized array by original index, "first chunk wins" for
    // overview.organization would pick 'Third' instead of 'First'.
    let callIndex = 0;
    const delaysMs = [60, 30, 5]; // chunk 1, 2, 3 respectively
    setProvider({
      name: 'mock-reordered',
      async complete() {
        const i = callIndex++;
        await new Promise((resolve) => setTimeout(resolve, delaysMs[i]));
        return mockResultForPage(i + 1, { organization: ['First', 'Second', 'Third'][i] });
      },
    });

    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'COMPLETED');
    assert.equal(
      updated.organization, 'First',
      'overview must reflect document order (chunk 1), not AI-call completion order (chunk 3 finished first)',
    );
    // All three chunks' requirements must still be present — concurrency
    // must not drop or duplicate a chunk's results.
    assert.equal((await listRequirements(scope, tender.id)).length, 3);
  });

  await t.test('one chunk failing among several concurrent chunks does not affect the others', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Partial Failure Co', userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'partial-failure.pdf' });
    const bigText = (label) => `${label} ` + 'x'.repeat(config.bidpilot.analysis.chunkChars + 1000);
    await insertPages(scope, tender.id, [
      { pageNumber: 1, rawText: bigText('a'), ocrUsed: false },
      { pageNumber: 2, rawText: bigText('b'), ocrUsed: false },
      { pageNumber: 3, rawText: bigText('c'), ocrUsed: false },
    ]);

    let callIndex = 0;
    setProvider({
      name: 'mock-partial-fail',
      async complete() {
        const i = callIndex++;
        if (i === 1) throw new Error('simulated provider error for chunk 2');
        return mockResultForPage(i + 1, { requirementCount: 1 });
      },
    });

    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const updated = await getTender(scope, tender.id);
    assert.equal(updated.analysisStatus, 'COMPLETED', 'partial success — the other two chunks still landed');
    assert.equal((await listRequirements(scope, tender.id)).length, 2, 'exactly the two successful chunks worth');
  });

  // ── Production QA fixes (1 Oct 2026) ─────────────────────────────────────

  async function multiChunkTender(label, pageCount) {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: `${label} Co`, userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: `${label}.pdf` });
    const bigText = (p) => `page${p} ` + 'x'.repeat(config.bidpilot.analysis.chunkChars + 1000);
    await insertPages(scope, tender.id, Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1, rawText: bigText(i + 1), ocrUsed: false,
    })));
    return { scope, tender };
  }

  async function latestAnalysisMetadata(tenderId) {
    const events = await db.select().from(tenderEvents).where(eq(tenderEvents.tenderId, tenderId));
    return events.find((e) => e.eventType === 'analysis_completed')?.metadata;
  }

  await t.test('an unparseable chunk is retried once, and the retry\'s result is kept', async () => {
    const { scope, tender } = await multiChunkTender('retry', 1);
    let calls = 0;
    setProvider({
      name: 'mock-flaky',
      async complete() {
        calls += 1;
        return calls === 1 ? 'not json' : mockResultForPage(1, { organization: 'Recovered Org' });
      },
    });

    await runAnalysis(scope, tender.id, { isReanalysis: false });
    const updated = await getTender(scope, tender.id);
    assert.equal(calls, 2);
    assert.equal(updated.analysisStatus, 'COMPLETED');
    assert.equal(updated.organization, 'Recovered Org', 'the overview survives a one-off malformed reply');
    assert.deepEqual(
      { chunkCount: 1, failedChunkCount: 0 },
      (({ chunkCount, failedChunkCount }) => ({ chunkCount, failedChunkCount }))(await latestAnalysisMetadata(tender.id)),
    );
  });

  await t.test('a chunk that is unparseable twice is counted as failed in the analysis event', async () => {
    const { scope, tender } = await multiChunkTender('twice', 3);
    setProvider({
      name: 'mock-one-bad-chunk',
      async complete({ user }) {
        const page = Number(/\[PAGE (\d+)\]/.exec(user)[1]);
        return page === 1 ? 'still not json' : mockResultForPage(page);
      },
    });

    await runAnalysis(scope, tender.id, { isReanalysis: false });
    assert.equal((await getTender(scope, tender.id)).analysisStatus, 'COMPLETED');
    const meta = await latestAnalysisMetadata(tender.id);
    assert.equal(meta.chunkCount, 3);
    assert.equal(meta.failedChunkCount, 1);
  });

  await t.test('chunk extraction asks the provider for the long timeout and one SDK retry', async () => {
    const { scope, tender } = await multiChunkTender('timeout', 1);
    const seen = [];
    setProvider({ name: 'mock-args', async complete(args) { seen.push(args); return mockResultForPage(1); } });

    await runAnalysis(scope, tender.id, { isReanalysis: false });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].timeoutMs, config.bidpilot.analysis.aiTimeoutMs);
    assert.equal(seen[0].maxRetries, 1);
    assert.equal(config.bidpilot.analysis.aiTimeoutMs, 180_000, 'default is 3 minutes, not the 60s client default');
  });

  await t.test('two analyses at once never exceed the server-wide AI call cap', async () => {
    const previous = config.bidpilot.analysis.globalConcurrency;
    config.bidpilot.analysis.globalConcurrency = 2;
    try {
      const a = await multiChunkTender('global-a', 4);
      const b = await multiChunkTender('global-b', 4);
      let inFlight = 0;
      let maxInFlight = 0;
      setProvider({
        name: 'mock-slow',
        async complete({ user }) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;
          return mockResultForPage(Number(/\[PAGE (\d+)\]/.exec(user)[1]));
        },
      });

      await Promise.all([
        runAnalysis(a.scope, a.tender.id, { isReanalysis: false }),
        runAnalysis(b.scope, b.tender.id, { isReanalysis: false }),
      ]);
      assert.equal(maxInFlight, 2, 'per-run concurrency is 4, so without the global cap this would reach 8');
      assert.equal((await getTender(a.scope, a.tender.id)).analysisStatus, 'COMPLETED');
      assert.equal((await getTender(b.scope, b.tender.id)).analysisStatus, 'COMPLETED');
    } finally {
      config.bidpilot.analysis.globalConcurrency = previous;
    }
  });
});

// ── Full HTTP integration ───────────────────────────────────────────────────

test('POST /tenders/:id/analyze (HTTP integration)', { skip: SKIP_REASON, timeout: 30_000 }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createTendersRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    await closeTestDb();
  });

  let userA, companyA, userB, companyB, authA, authB;

  async function mintAuth(userId) {
    const { rawToken, session } = await createSession(db, userId);
    return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  }

  t.beforeEach(async () => {
    await truncateAll();
    const a = await createCompanyWithOwner(db, { companyName: 'Analysis Co A', userEmail: 'a@analyze.example', userName: 'A' });
    const b = await createCompanyWithOwner(db, { companyName: 'Analysis Co B', userEmail: 'b@analyze.example', userName: 'B' });
    userA = a.user; companyA = a.company;
    userB = b.user; companyB = b.company;
    authA = await mintAuth(userA.id);
    authB = await mintAuth(userB.id);
  });

  function req(method, path, { body, auth, company } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...(auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {}),
      };
      const r = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  async function makeCompletedTender(scope, pages = [{ pageNumber: 1, rawText: 'Some tender text', ocrUsed: false }]) {
    const tender = await createTender(scope, { title: 'x.pdf' });
    await insertPages(scope, tender.id, pages);
    await updateProcessingStatus(scope, tender.id, 'COMPLETED');
    return tender;
  }

  async function waitForAnalysis(tenderId, auth = authA, company = companyA, maxMs = 10_000) {
    const start = Date.now();
    for (;;) {
      const { json } = await req('GET', `/bidpilot/tenders/${tenderId}?companyId=${company.id}`, { auth });
      if (json.analysisStatus === 'COMPLETED' || json.analysisStatus === 'FAILED') return json;
      if (Date.now() - start > maxMs) throw new Error(`Timed out, last: ${json.analysisStatus}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  await t.test('the golden path: analyze a COMPLETED tender end to end', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeCompletedTender(scope);
    setProvider({ name: 'mock', async complete() { return mockValidResult({ organization: 'Acme' }); } });

    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 202);
    assert.equal(res.json.analysisStatus, 'ANALYZING');

    const final = await waitForAnalysis(tender.id);
    assert.equal(final.analysisStatus, 'COMPLETED');
  });

  await t.test('analyzing a tender whose extraction is not COMPLETED is refused (409)', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await createTender(scope, { title: 'x.pdf' }); // processingStatus stays UPLOADED
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 409);
  });

  await t.test('two concurrent analyze requests: exactly one proceeds, the other gets 409', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeCompletedTender(scope);
    setProvider({ name: 'mock', async complete() {
      await new Promise((r) => setTimeout(r, 50)); // widen the race window
      return mockValidResult();
    } });

    const [r1, r2] = await Promise.all([
      req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } }),
      req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [202, 409]);
    await waitForAnalysis(tender.id);
  });

  await t.test('re-analyzing an already-COMPLETED analysis is allowed and replaces it', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeCompletedTender(scope);
    setProvider({ name: 'mock', async complete() { return mockValidResult({ requirementCount: 2 }); } });
    await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    await waitForAnalysis(tender.id);

    setProvider({ name: 'mock2', async complete() { return mockValidResult({ requirementCount: 1 }); } });
    const res2 = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res2.status, 202);
    await waitForAnalysis(tender.id);

    const reqs = await listRequirements(scope, tender.id);
    assert.equal(reqs.length, 1, 'replaced, not accumulated across the two HTTP-triggered runs');
  });

  await t.test('a tender that would exceed the per-tender chunk cap is refused with 413', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    // One page far bigger than the chunk budget alone still becomes exactly
    // ONE chunk (chunker.js never splits a single page) — so to legitimately
    // exceed the cap we need more PAGES than maxChunksPerTender allows, each
    // page forced into its own chunk by giving it more text than the budget.
    const bigPageText = 'x'.repeat(config.bidpilot.analysis.chunkChars + 1000);
    const pages = Array.from({ length: config.bidpilot.analysis.maxChunksPerTender + 1 }, (_, i) => ({
      pageNumber: i + 1, rawText: bigPageText, ocrUsed: false,
    }));
    const tender = await makeCompletedTender(scope, pages);
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 413);
  });

  await t.test('Company A cannot analyze Company B\'s tender', async () => {
    const scopeB = await requireCompanyAccess(db, { userId: userB.id, companyId: companyB.id });
    const tenderB = await makeCompletedTender(scopeB);
    const res = await req('POST', `/bidpilot/tenders/${tenderB.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 404, 'indistinguishable from not-found, same as every other cross-tenant lookup');
  });

  await t.test('analyze requires CSRF like every other state-changing tender route', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeCompletedTender(scope);
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, {
      body: { companyId: companyA.id },
      auth: { cookie: authA.cookie, csrf: 'wrong-token' },
    });
    assert.equal(res.status, 403);
  });

  await t.test('analyze requires a session like every other tender route', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeCompletedTender(scope);
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { body: { companyId: companyA.id } });
    assert.equal(res.status, 401);
  });
});

// What the tender page shows after "Analysis failed:". A database error's own
// message is the SQL plus bound parameters (tender text) — never shown.
test('safeErrorMessage hides database errors from users', () => {
  const dbErr = new Error('Failed query: insert into "tender_boq_items" ... params: 1,Cement,2,150');
  dbErr.cause = Object.assign(new Error('invalid input syntax for type numeric: "2,150"'), { code: '22P02' });
  const shown = safeErrorMessage(dbErr);
  assert.ok(!/insert|params|numeric|Cement/i.test(shown), shown);
  assert.match(shown, /could not be saved\. Please run it again\./);

  assert.equal(safeErrorMessage(new Error('OpenAI rate limit exceeded')), 'OpenAI rate limit exceeded');
  assert.equal(safeErrorMessage(new Error('x'.repeat(900))).length, 500);
});
