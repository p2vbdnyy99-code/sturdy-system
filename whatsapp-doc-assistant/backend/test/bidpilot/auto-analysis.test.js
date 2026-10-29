// The automatic analysis start after a PDF has been read (analysis/start.js,
// 29 Oct 2026), over real HTTP, real Postgres and real extraction. The AI
// provider is always mocked. What must hold: the same checks as the Analyze
// button, one trial or plan slot per tender however many starts race, a
// refusal leaves the tender ready to analyse, and nothing starts by itself
// unless the upload asked for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { and, eq } from 'drizzle-orm';
import { formattingPdf } from '../fixtures.mjs';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll, completeProfile, attachTestDocument } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, updateProcessingStatus } from '../../src/bidpilot/repo/tenders.js';
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { autoStartAnalysis, recordAutoAnalysisRequest, AUTO_SKIPPED_EVENT } from '../../src/bidpilot/analysis/start.js';
import { recoverInterruptedWork } from '../../src/bidpilot/recovery.js';
import { buildBidpilotConfig, config } from '../../src/config.js';
import { setProvider } from '../../src/ai/index.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createDashboardRouter } from '../../src/bidpilot/routes/dashboard.js';
import { subscriptions, tenderEvents, usageRecords } from '../../src/db/schema/index.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

const validResult = () => JSON.stringify({
  overview: { organization: { value: 'Public Works Department', sourcePage: 1, evidenceText: 'q' } },
  requirements: [{
    category: 'FINANCIAL', title: 'Turnover', description: 'Average turnover', mandatory: true,
    sourcePage: 1, evidenceText: 'quoted evidence', extractedValue: 'Rs 5 crore', confidence: 0.9,
  }],
  boq: [], dates: [], redFlags: [],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('BIDPILOT_AUTO_ANALYZE: on when unset; off, false, 0 and no switch it off', () => {
  assert.equal(buildBidpilotConfig({}).analysis.autoStart, true, 'unset: on (documented default)');
  for (const off of ['off', 'false', '0', 'no', ' OFF ', 'False', '  0', 'NO\n']) {
    assert.equal(buildBidpilotConfig({ BIDPILOT_AUTO_ANALYZE: off }).analysis.autoStart, false, JSON.stringify(off));
  }
  for (const on of ['on', 'true', '1', 'yes', 'ON']) {
    assert.equal(buildBidpilotConfig({ BIDPILOT_AUTO_ANALYZE: on }).analysis.autoStart, true, JSON.stringify(on));
  }
});

test('automatic analysis after upload', { skip: SKIP_REASON, timeout: 120_000 }, async (t) => {
  const db = testDb();
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bidpilot-auto-test-'));
  const storage = new LocalDiskStorage({ dir: storageDir, publicBaseUrl: 'http://placeholder', signingSecret: 'auto-test-secret' });
  let server;
  let baseUrl;
  let company;
  let user;
  let auth;
  let calls = 0;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 5 }));
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createTendersRouter());
    app.use('/bidpilot', createDashboardRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    storage.publicBaseUrl = baseUrl;
    setStorage(storage);
  });

  t.after(async () => {
    await sleep(300); // let the last background job settle
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(storageDir, { recursive: true, force: true });
    setStorage(null);
    await closeDb();
    await closeTestDb();
  });

  t.beforeEach(async () => {
    await sleep(250); // the previous test's background work
    await truncateAll();
    config.bidpilot.analysis.autoStart = true;
    const a = await createCompanyWithOwner(db, { companyName: 'Auto Co', userEmail: 'auto@example.com', userName: 'Auto' });
    company = a.company;
    user = a.user;
    const { rawToken, session } = await createSession(db, user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    calls = 0;
    setProvider({ name: 'mock', async complete() { calls += 1; await sleep(30); return validResult(); } });
  });

  function req(method, urlPath, { body, raw, contentType, as = auth } = {}) {
    return new Promise((resolve, reject) => {
      const payload = raw ?? (body ? Buffer.from(JSON.stringify(body)) : null);
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${as.cookie}`, 'x-csrf-token': as.csrf,
        ...(payload ? { 'content-type': contentType ?? 'application/json', 'content-length': String(payload.length) } : {}),
      };
      const r = http.request(`${baseUrl}${urlPath}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  function upload(buffer, { autoAnalyze, path: urlPath = '/bidpilot/tenders/upload', companyId = company.id, as } = {}) {
    const boundary = '----auto' + Math.random().toString(16).slice(2);
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${companyId}\r\n`),
      ...(autoAnalyze ? [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="autoAnalyze"\r\n\r\n${autoAnalyze}\r\n`)] : []),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tender.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    return req('POST', urlPath, { raw: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}`, as });
  }

  const detail = async (id) => (await req('GET', `/bidpilot/tenders/${id}?companyId=${company.id}`)).json;
  const analyse = (id) => req('POST', `/bidpilot/tenders/${id}/analyze`, { body: { companyId: company.id } });
  const summary = async () => (await req('GET', `/bidpilot/dashboard/summary?companyId=${company.id}`)).json;
  const scope = () => requireCompanyAccess(db, { userId: user.id, companyId: company.id });

  async function waitFor(id, done, maxMs = 30_000) {
    const start = Date.now();
    for (;;) {
      const d = await detail(id);
      if (done(d)) return d;
      if (Date.now() - start > maxMs) throw new Error(`timed out: processing=${d.processingStatus} analysis=${d.analysisStatus}`);
      await sleep(100);
    }
  }
  const settled = (d) => d.analysisStatus === 'COMPLETED' || d.analysisStatus === 'FAILED';

  /** A tender whose PDF has been read, made directly (no upload), with the
   *  upload's automatic-start request recorded for `expect` (null: none). */
  async function readTender(title = 'read.pdf', expect = 'trial') {
    const s = await scope();
    const tender = await createTender(s, { title });
    await attachTestDocument(tender.id);
    if (expect) await recordAutoAnalysisRequest(s, tender.id, expect, user.id);
    await insertPages(s, tender.id, [{ pageNumber: 1, rawText: 'Tender text', ocrUsed: false }]);
    await updateProcessingStatus(s, tender.id, 'COMPLETED');
    return tender;
  }

  const slots = async (kind, tenderId) => (await db.select().from(usageRecords).where(and(
    eq(usageRecords.companyId, company.id), eq(usageRecords.kind, kind),
    ...(tenderId ? [eq(usageRecords.tenderId, tenderId)] : []),
  ))).length;

  await t.test('an upload that asked for it is analysed with no click, using one free tender', async () => {
    await completeProfile(company.id);
    const res = await upload(await formattingPdf(), { autoAnalyze: 'trial' });
    assert.equal(res.status, 201);
    assert.equal(res.json.autoAnalyze, true);
    const final = await waitFor(res.json.tenderId, settled);
    assert.equal(final.analysisStatus, 'COMPLETED');
    assert.equal(final.processingStatus, 'COMPLETED');
    assert.equal(await slots('trial_tender', res.json.tenderId), 1);
    assert.ok(calls >= 1);
  });

  await t.test('an upload without the flag waits for the Analyze click, as before', async () => {
    const res = await upload(await formattingPdf());
    assert.equal(res.json.autoAnalyze, false);
    await waitFor(res.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(res.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), 0);
    assert.equal(calls, 0);
    const s = await summary();
    assert.deepEqual(s.readyToAnalyse.map((r) => [r.id, r.blockedBy]), [[res.json.tenderId, null]]);
    assert.equal(s.upload.autoAnalyze, true);
    assert.equal(s.upload.maxMb, Math.round(config.bidpilot.maxUploadBytes / (1024 * 1024)));
    assert.equal((await analyse(res.json.tenderId)).status, 202, 'the Analyze button still works');
    await waitFor(res.json.tenderId, settled);
  });

  await t.test('with BIDPILOT_AUTO_ANALYZE off, the flag is ignored', async () => {
    config.bidpilot.analysis.autoStart = false;
    const res = await upload(await formattingPdf(), { autoAnalyze: 'trial' });
    assert.equal(res.json.autoAnalyze, false);
    await waitFor(res.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(res.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal((await summary()).upload.autoAnalyze, false);
  });

  await t.test('repeated automatic starts, together and one after another, run once and use one slot', async () => {
    const tender = await readTender();
    const s = await scope();
    const results = await Promise.all([autoStartAnalysis(db, s, tender.id), autoStartAnalysis(db, s, tender.id), autoStartAnalysis(db, s, tender.id)]);
    assert.equal(results.filter((r) => r.started).length, 1, JSON.stringify(results));
    for (const r of results.filter((x) => !x.started)) assert.ok(['already_running', 'not_applicable'].includes(r.code), r.code);
    await waitFor(tender.id, settled);
    const again = await autoStartAnalysis(db, s, tender.id);
    assert.deepEqual(again, { started: false, code: 'not_applicable' }, 'an analysed tender is not re-run by itself');
    assert.equal(await slots('trial_tender', tender.id), 1);
    assert.equal(calls, 1, 'one AI call for the one chunk');
  });

  await t.test('an automatic start and an Analyze click at the same moment: one run, one slot', async () => {
    const tender = await readTender();
    const s = await scope();
    const [auto, click] = await Promise.all([autoStartAnalysis(db, s, tender.id), analyse(tender.id)]);
    assert.equal(Number(auto.started) + Number(click.status === 202), 1, `auto=${JSON.stringify(auto)} click=${click.status}`);
    if (click.status !== 202) {
      assert.equal(click.status, 409);
      assert.equal(click.json.code, 'already_running');
      assert.equal(click.json.error, 'This tender is already being analysed.');
    }
    await waitFor(tender.id, settled);
    assert.equal(await slots('trial_tender', tender.id), 1);
    assert.equal(calls, 1);
  });

  await t.test('past the free tenders without a profile: not started, and the dashboard says why', async () => {
    await readTender('one.pdf');
    await readTender('two.pdf');
    await readTender('three.pdf');
    const fourth = await readTender('four.pdf'); // e.g. a document attached to a tracked tender
    const result = await autoStartAnalysis(db, await scope(), fourth.id);
    assert.deepEqual(result, { started: false, code: 'profile_incomplete' });
    assert.equal((await detail(fourth.id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender', fourth.id), 0);
    const ready = (await summary()).readyToAnalyse.find((r) => r.id === fourth.id);
    assert.equal(ready.blockedBy, 'profile_incomplete');
    await completeProfile(company.id);
    assert.equal((await analyse(fourth.id)).status, 202, 'recoverable once the profile is complete');
    await waitFor(fourth.id, settled);
  });

  await t.test('an exhausted free trial: not started, no slot, and the dashboard offers the plans', async () => {
    await completeProfile(company.id);
    await db.insert(usageRecords).values(Array.from({ length: config.bidpilot.analysis.trialTenders }, () => ({ companyId: company.id, kind: 'trial_tender', quantity: 1 })));
    const tender = await readTender();
    const result = await autoStartAnalysis(db, await scope(), tender.id);
    assert.deepEqual(result, { started: false, code: 'trial_exhausted' });
    assert.equal((await detail(tender.id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), config.bidpilot.analysis.trialTenders, 'no extra slot');
    assert.equal(calls, 0);
    assert.equal((await summary()).readyToAnalyse[0].blockedBy, 'trial_exhausted');
    const click = await analyse(tender.id);
    assert.equal(click.status, 402);
    assert.equal(click.json.code, 'trial_exhausted');
  });

  await t.test('on a paid plan an automatic start uses a plan slot, never the trial; a full plan is refused', async () => {
    await completeProfile(company.id);
    await db.insert(subscriptions).values({
      companyId: company.id, plan: 'STARTER', status: 'ACTIVE',
      periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 29 * 86_400_000),
    });
    const tender = await readTender('plan.pdf', 'plan:Starter');
    assert.equal((await autoStartAnalysis(db, await scope(), tender.id)).started, true);
    await waitFor(tender.id, settled);
    assert.equal(await slots('plan_tender', tender.id), 1);
    assert.equal(await slots('trial_tender'), 0);
    await db.insert(usageRecords).values(Array.from({ length: 9 }, () => ({ companyId: company.id, kind: 'plan_tender', quantity: 1 })));
    const extra = await readTender('extra.pdf', 'plan:Starter');
    assert.deepEqual(await autoStartAnalysis(db, await scope(), extra.id), { started: false, code: 'plan_exhausted' });
    assert.equal((await summary()).readyToAnalyse.find((r) => r.id === extra.id).blockedBy, 'plan_exhausted');
  });

  await t.test('a failed analysis is recorded; it is not retried by itself, and a retry takes no second slot', async () => {
    await completeProfile(company.id);
    setProvider({ name: 'down', async complete() { calls += 1; throw new Error('provider unavailable'); } });
    const tender = await readTender();
    assert.equal((await autoStartAnalysis(db, await scope(), tender.id)).started, true);
    const failed = await waitFor(tender.id, settled);
    assert.equal(failed.analysisStatus, 'FAILED');
    assert.ok(failed.analysisError, 'the failure has a message');
    assert.doesNotMatch(failed.analysisError, /provider unavailable/, 'no internal error text');
    assert.deepEqual(await autoStartAnalysis(db, await scope(), tender.id), { started: false, code: 'not_applicable' });
    setProvider({ name: 'mock', async complete() { return validResult(); } });
    assert.equal((await analyse(tender.id)).status, 202);
    assert.equal((await waitFor(tender.id, settled)).analysisStatus, 'COMPLETED');
    assert.equal(await slots('trial_tender', tender.id), 1, 'the retry used the same slot');
  });

  await t.test('the daily limit refuses an automatic start and leaves the tender ready', async () => {
    await completeProfile(company.id);
    const previous = config.bidpilot.analysis.maxCallsPerCompanyPerDay;
    config.bidpilot.analysis.maxCallsPerCompanyPerDay = 0;
    try {
      const tender = await readTender();
      assert.deepEqual(await autoStartAnalysis(db, await scope(), tender.id), { started: false, code: 'company_daily_cap' });
      assert.equal((await detail(tender.id)).analysisStatus, 'NOT_STARTED');
      assert.equal(await slots('trial_tender'), 0);
      const click = await analyse(tender.id);
      assert.equal(click.status, 429);
      assert.match(click.json.error, /today.s analysis limit.*stays ready to analyse/);
    } finally {
      config.bidpilot.analysis.maxCallsPerCompanyPerDay = previous;
    }
  });

  // What the dashboard now sends for a used-up allowance: no automatic-start
  // request. The PDF is read, nothing starts, no slot is taken.
  await t.test('an exhausted free trial: the upload is read, not analysed, and uses nothing', async () => {
    await completeProfile(company.id);
    const limit = config.bidpilot.analysis.trialTenders;
    await db.insert(usageRecords).values(Array.from({ length: limit }, () => ({ companyId: company.id, kind: 'trial_tender', quantity: 1 })));
    const res = await upload(await formattingPdf());
    assert.equal(res.status, 201);
    assert.equal(res.json.autoAnalyze, false);
    await waitFor(res.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(res.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), limit, 'no slot taken');
    assert.equal(calls, 0);
    assert.equal((await summary()).readyToAnalyse[0].blockedBy, 'trial_exhausted');
    // A stale page that still asks for the automatic start is refused by the server.
    const stale = await upload(Buffer.concat([await formattingPdf(), Buffer.from('\n% stale copy\n')]), { autoAnalyze: 'trial' });
    await waitFor(stale.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(stale.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), limit, 'still no slot');
    assert.equal(calls, 0);
  });

  await t.test('an exhausted monthly plan: the upload is read, not analysed, and uses nothing', async () => {
    await completeProfile(company.id);
    await db.insert(subscriptions).values({
      companyId: company.id, plan: 'STARTER', status: 'ACTIVE',
      periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 29 * 86_400_000),
    });
    await db.insert(usageRecords).values(Array.from({ length: 10 }, () => ({ companyId: company.id, kind: 'plan_tender', quantity: 1 })));
    const res = await upload(await formattingPdf());
    assert.equal(res.status, 201);
    await waitFor(res.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(res.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('plan_tender'), 10);
    assert.equal(await slots('trial_tender'), 0);
    assert.equal((await summary()).readyToAnalyse[0].blockedBy, 'plan_exhausted');
    const stale = await upload(Buffer.concat([await formattingPdf(), Buffer.from('\n% stale copy\n')]), { autoAnalyze: 'plan:Starter' });
    await waitFor(stale.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    await sleep(300);
    assert.equal((await detail(stale.json.tenderId)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('plan_tender'), 10, 'no plan slot taken');
    assert.equal(calls, 0);
  });

  // The tender-search "attach the PDF" form shows no notice about analysis,
  // so it never starts by itself, whatever the request says.
  await t.test('attaching a PDF to a tracked tender keeps the Analyze click, with or without the flag', async () => {
    await completeProfile(company.id);
    const s = await scope();
    const plain = await createTender(s, { title: 'tracked-one' });
    const flagged = await createTender(s, { title: 'tracked-two' });
    const a = await upload(await formattingPdf(), { path: `/bidpilot/tenders/${plain.id}/document` });
    const b = await upload(Buffer.concat([await formattingPdf(), Buffer.from('\n% second\n')]), { path: `/bidpilot/tenders/${flagged.id}/document`, autoAnalyze: 'trial' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.json.autoAnalyze, false);
    for (const id of [plain.id, flagged.id]) {
      await waitFor(id, (d) => d.processingStatus === 'COMPLETED');
    }
    await sleep(300);
    for (const id of [plain.id, flagged.id]) assert.equal((await detail(id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), 0);
    assert.equal(calls, 0);
    assert.equal((await analyse(plain.id)).status, 202, 'the Analyze click works as before');
    await waitFor(plain.id, settled);
  });

  await t.test('attaching a PDF still checks company access', async () => {
    await completeProfile(company.id);
    const target = await createTender(await scope(), { title: 'tracked-a' });
    const other = await createCompanyWithOwner(db, { companyName: 'Other Co', userEmail: 'other@example.com', userName: 'O' });
    await completeProfile(other.company.id);
    const { rawToken, session } = await createSession(db, other.user.id);
    const otherAuth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    const naming = await upload(await formattingPdf(), { path: `/bidpilot/tenders/${target.id}/document`, as: otherAuth, autoAnalyze: 'trial' });
    assert.equal(naming.status, 403, "naming the other company's id");
    const own = await upload(await formattingPdf(), { path: `/bidpilot/tenders/${target.id}/document`, companyId: other.company.id, as: otherAuth, autoAnalyze: 'trial' });
    assert.equal(own.status, 404, "the other company's tender isn't visible from its own company");
    assert.equal((await detail(target.id)).processingStatus, 'UPLOADED', 'nothing was attached');
    assert.equal(calls, 0);
  });

  // ── The allowance kind the upload notice described (29 Oct review) ─────
  const starter = () => db.insert(subscriptions).values({
    companyId: company.id, plan: 'STARTER', status: 'ACTIVE',
    periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 29 * 86_400_000),
  });
  const skipReason = async (tenderId) => (await db.select().from(tenderEvents)
    .where(and(eq(tenderEvents.tenderId, tenderId), eq(tenderEvents.eventType, AUTO_SKIPPED_EVENT))))[0]?.metadata?.reason;

  await t.test('same allowance at upload and when reading finishes: analysed by itself, one slot', async () => {
    await completeProfile(company.id);
    const res = await upload(await formattingPdf(), { autoAnalyze: 'trial' });
    assert.equal(res.json.autoAnalyze, true);
    assert.equal((await waitFor(res.json.tenderId, settled)).analysisStatus, 'COMPLETED');
    assert.equal(await slots('trial_tender', res.json.tenderId), 1);
  });

  await t.test('trial became a paid plan before reading finished: not started, no slot, then analysable by hand', async () => {
    await completeProfile(company.id);
    const tender = await readTender('changed.pdf', 'trial');
    await starter(); // the plan starts while the PDF is being read
    assert.deepEqual(await autoStartAnalysis(db, await scope(), tender.id), { started: false, code: 'allowance_changed' });
    assert.equal((await detail(tender.id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('plan_tender'), 0, 'no plan slot');
    assert.equal(await slots('trial_tender'), 0, 'no trial slot');
    assert.equal(calls, 0);
    assert.equal(await skipReason(tender.id), 'allowance_changed', 'recorded for the dashboard');
    assert.equal((await summary()).readyToAnalyse.find((r) => r.id === tender.id).blockedBy, 'allowance_changed');
    assert.equal((await analyse(tender.id)).status, 202, 'the user can start it by hand');
    await waitFor(tender.id, settled);
    assert.equal(await slots('plan_tender', tender.id), 1, 'the click uses the current plan, under the usual checks');
  });

  await t.test('the active plan changed before reading finished: not started, no slot', async () => {
    await completeProfile(company.id);
    await starter();
    const tender = await readTender('plan-change.pdf', 'plan:Starter');
    await db.insert(subscriptions).values({
      companyId: company.id, plan: 'PRO', status: 'ACTIVE',
      periodStart: new Date(Date.now() - 1000), periodEnd: new Date(Date.now() + 30 * 86_400_000),
    });
    assert.deepEqual(await autoStartAnalysis(db, await scope(), tender.id), { started: false, code: 'allowance_changed' });
    assert.equal((await detail(tender.id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('plan_tender'), 0);
    assert.equal(calls, 0);
  });

  await t.test('the free tenders ran out before reading finished: not started, no slot', async () => {
    await completeProfile(company.id);
    const tender = await readTender('ran-out.pdf', 'trial');
    await db.insert(usageRecords).values(Array.from({ length: config.bidpilot.analysis.trialTenders }, () => ({ companyId: company.id, kind: 'trial_tender', quantity: 1 })));
    assert.deepEqual(await autoStartAnalysis(db, await scope(), tender.id), { started: false, code: 'trial_exhausted' });
    assert.equal(await slots('trial_tender', tender.id), 0);
    assert.equal(calls, 0);
  });

  await t.test('a missing, invalid or untrue allowance kind authorises nothing', async () => {
    await completeProfile(company.id);
    const none = await readTender('none.pdf', null);
    assert.deepEqual(await autoStartAnalysis(db, await scope(), none.id), { started: false, code: 'no_request' });
    const invalid = await readTender('invalid.pdf', 'plan:Platinum');
    assert.deepEqual(await autoStartAnalysis(db, await scope(), invalid.id), { started: false, code: 'no_request' });
    // A trial company claiming "unlimited": the server's own entitlement decides.
    const untrue = await readTender('untrue.pdf', 'unlimited');
    assert.deepEqual(await autoStartAnalysis(db, await scope(), untrue.id), { started: false, code: 'allowance_changed' });
    for (const id of [none.id, invalid.id, untrue.id]) assert.equal((await detail(id)).analysisStatus, 'NOT_STARTED');
    assert.equal(await slots('trial_tender'), 0);
    // Over HTTP: a bare "1" or an unknown plan is not a request.
    for (const [i, value] of ['1', 'plan:Platinum', 'true'].entries()) {
      const res = await upload(Buffer.concat([await formattingPdf(), Buffer.from(`\n% bad ${i}\n`)]), { autoAnalyze: value });
      assert.equal(res.status, 201);
      assert.equal(res.json.autoAnalyze, false, value);
      await waitFor(res.json.tenderId, (d) => d.processingStatus === 'COMPLETED');
    }
    await sleep(300);
    assert.equal(await slots('trial_tender'), 0);
    assert.equal(calls, 0);
  });

  await t.test('two starts against a changed allowance and a click: at most one slot, by the click', async () => {
    await completeProfile(company.id);
    const tender = await readTender('race.pdf', 'trial');
    await starter();
    const s = await scope();
    const [a1, a2, click] = await Promise.all([autoStartAnalysis(db, s, tender.id), autoStartAnalysis(db, s, tender.id), analyse(tender.id)]);
    assert.equal(a1.started || a2.started, false, 'the automatic starts never use the new plan');
    assert.equal(click.status, 202);
    await waitFor(tender.id, settled);
    assert.equal(await slots('plan_tender', tender.id), 1);
    assert.equal(await slots('trial_tender'), 0);
  });

  await t.test('a restart while reading: the tender fails safe, nothing starts by itself, a new upload works', async () => {
    await completeProfile(company.id);
    const s = await scope();
    const tender = await createTender(s, { title: 'interrupted.pdf' });
    await attachTestDocument(tender.id);
    await recordAutoAnalysisRequest(s, tender.id, 'trial', user.id);
    await updateProcessingStatus(s, tender.id, 'EXTRACTING');
    await recoverInterruptedWork(db);
    const after = await detail(tender.id);
    assert.equal(after.processingStatus, 'FAILED');
    assert.equal(after.analysisStatus, 'NOT_STARTED');
    assert.deepEqual(await autoStartAnalysis(db, s, tender.id), { started: false, code: 'not_applicable' });
    assert.equal(await slots('trial_tender'), 0);
  });

  await t.test('plain messages: still being read, unreadable, and a file over the size limit', async () => {
    await completeProfile(company.id);
    const s = await scope();
    const reading = await createTender(s, { title: 'reading.pdf' });
    await attachTestDocument(reading.id);
    const notReady = await analyse(reading.id);
    assert.equal(notReady.status, 409);
    assert.equal(notReady.json.code, 'not_ready');
    assert.doesNotMatch(notReady.json.error, /COMPLETED|UPLOADED|processing is/);
    await updateProcessingStatus(s, reading.id, 'FAILED', 'x');
    const unreadable = await analyse(reading.id);
    assert.equal(unreadable.json.code, 'not_readable');
    assert.match(unreadable.json.error, /upload the PDF again/);

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(config.bidpilot.maxUploadBytes + 1024, 32)]);
    const tooBig = await upload(big, { autoAnalyze: 'trial' });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.json.code, 'file_too_large');
    assert.match(tooBig.json.error, new RegExp(`${Math.round(config.bidpilot.maxUploadBytes / (1024 * 1024))} MB limit`));
  });
});
