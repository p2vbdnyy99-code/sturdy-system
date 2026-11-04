// GA4 conversion events sent by the server (src/bidpilot/conversions.js,
// ga4.js buildEvent): what each carries, that the team is left out, and that
// each fires once from the real routes and the analysis pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { formattingPdf } from '../fixtures.mjs';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll, completeProfile } from '../db/helpers.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { runAnalysis } from '../../src/bidpilot/analysis/pipeline.js';
import { setProvider } from '../../src/ai/index.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createVisitsRouter } from '../../src/bidpilot/visits.js';
import { buildEvent, buildPageView, createGa4EventSender, CONVERSION_EVENTS } from '../../src/bidpilot/ga4.js';
import { configureConversions, trackConversion } from '../../src/bidpilot/conversions.js';

const TEAM = 'team@example.test';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

test('event bodies: the four events, one allowed parameter each, no ids', () => {
  assert.deepEqual(CONVERSION_EVENTS, ['sign_up', 'upload', 'analysis_complete', 'plan_click']);
  const e = buildEvent({ name: 'sign_up', params: { method: 'google', email: 'x@y.z', userId: 'u1' }, visitorId: '0123456789abcdef', day: '2026-11-04' });
  assert.deepEqual(Object.keys(e.events[0].params).sort(), ['engagement_time_msec', 'method', 'session_id']);
  assert.equal(e.events[0].params.method, 'google');
  // Joined to the same visitor and day as that visitor's page views.
  const pv = buildPageView({ path: '/pricing', source: 'direct', campaign: null, device: 'mobile', visitorId: '0123456789abcdef', day: '2026-11-04' }, 'https://tendertez.in');
  assert.equal(e.client_id, pv.client_id);
  assert.equal(e.events[0].params.session_id, pv.events[0].params.session_id);
  assert.deepEqual(buildEvent({ name: 'plan_click', params: { plan: 'starter' } }).events[0].params.plan, 'starter');
  assert.equal(buildEvent({ name: 'plan_click', params: { plan: 'enterprise' } }).events[0].params.plan, undefined, 'unknown values dropped');
  assert.equal(buildEvent({ name: 'upload', params: { from: 'dashboard', filename: 'secret.pdf' } }).events[0].params.filename, undefined);
  assert.equal(buildEvent({ name: 'purchase' }), null, 'only the four events');
  const bg = buildEvent({ name: 'analysis_complete', params: { reanalysis: 'no' } }, 1_762_250_000_000);
  assert.match(bg.client_id, /^\d+\.1762250000$/, 'a background event gets a random id');
  assert.ok(!JSON.stringify([e, bg]).match(/@|userId|company|tender/i), 'nothing identifying');
});

test('the event sender posts one body, and is off without GA4 settings', async () => {
  assert.equal(createGa4EventSender({}), null);
  const calls = [];
  const send = createGa4EventSender({
    measurementId: 'G-TEST1234', apiSecret: 's3cret',
    fetchImpl: async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 204 }; },
  });
  assert.equal(await send({ name: 'upload', params: { from: 'dashboard' } }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.events[0].name, 'upload');
  assert.equal(await send({ name: 'nope' }), false, 'nothing posted for an unknown event');
  assert.equal(calls.length, 1);
});

test('trackConversion: the team is left out; it never throws', () => {
  const sent = [];
  configureConversions({
    sender: (e) => { sent.push(e); },
    visitorOfRequest: () => ({ day: '2026-11-04', visitorId: '0123456789abcdef' }),
    admins: [TEAM],
  });
  trackConversion('sign_up', { req: { cookies: {} }, user: { email: 'buyer@example.test' }, params: { method: 'password' } });
  trackConversion('sign_up', { req: { cookies: {} }, user: { email: TEAM }, params: { method: 'password' } });
  trackConversion('plan_click', { req: { cookies: { bidpilot_staff: '1' } }, params: { plan: 'pro' } });
  assert.deepEqual(sent, [{ name: 'sign_up', params: { method: 'password' }, visitorId: '0123456789abcdef', day: '2026-11-04' }]);
  configureConversions({ sender: () => { throw new Error('network'); }, admins: [] });
  assert.doesNotThrow(() => trackConversion('upload', { params: { from: 'dashboard' } }));
  configureConversions({ sender: () => Promise.reject(new Error('network')), admins: [] });
  assert.doesNotThrow(() => trackConversion('upload', { params: { from: 'dashboard' } }));
  configureConversions({});
});

test('each event fires once from the real routes and pipeline', { skip: !dbAvailable() && 'DATABASE_URL not set', timeout: 180_000 }, async (t) => {
  const db = testDb();
  const sent = [];
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conversions-test-'));
  let server; let baseUrl;
  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 5 }));
    setStorage(new LocalDiskStorage({ dir: storageDir, publicBaseUrl: 'http://placeholder', signingSecret: 'test-signing' }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createTendersRouter());
    const visits = createVisitsRouter({ ownHosts: ['tendertez.in'] });
    app.use('/bidpilot', visits);
    configureConversions({ sender: (e) => { sent.push(e); }, visitorOfRequest: visits.visitorOf, admins: [TEAM] });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    configureConversions({});
    setProvider(null);
    await new Promise((r) => server.close(r));
    await fs.rm(storageDir, { recursive: true, force: true });
    setStorage(null);
    await closeDb();
    await closeTestDb();
  });
  t.beforeEach(async () => { await settle(250); await truncateAll(); sent.length = 0; });

  const request = (method, urlPath, headers = {}, body = null) => new Promise((resolve, reject) => {
    const r = http.request(`${baseUrl}${urlPath}`, { method, headers: { 'user-agent': CHROME, ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let json; try { json = JSON.parse(Buffer.concat(chunks).toString()); } catch { json = undefined; } resolve({ status: res.statusCode, json }); });
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
  const postJson = (p, data, headers = {}) => {
    const body = Buffer.from(JSON.stringify(data));
    return request('POST', p, { 'content-type': 'application/json', 'content-length': body.length, ...headers }, body);
  };
  const names = () => sent.map((e) => e.name);

  await t.test('sign_up: once per new account, with the method; not for the team or a taken email', async () => {
    assert.equal((await postJson('/bidpilot/register', { email: 'new@example.test', password: 'a-long-password-1' })).status, 201);
    assert.equal((await postJson('/bidpilot/register', { email: 'new@example.test', password: 'a-long-password-1' })).status, 409);
    assert.equal((await postJson('/bidpilot/register', { email: TEAM, password: 'a-long-password-1' })).status, 201);
    await settle();
    assert.deepEqual(names(), ['sign_up']);
    assert.equal(sent[0].params.method, 'password');
    assert.match(sent[0].visitorId, /^[0-9a-f]{16}$/, 'joined to the visitor\'s day');
  });

  async function uploadAs(email) {
    const { user, company } = await createCompanyWithOwner(db, { companyName: `Co ${email}`, userEmail: email, userName: 'U' });
    await completeProfile(company.id);
    const { rawToken, session } = await createSession(db, user.id);
    const boundary = `----t${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      await formattingPdf(), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length),
      cookie: `${SESSION_COOKIE_NAME}=${rawToken}`, 'x-csrf-token': csrfTokenFor(session.tokenHash),
    };
    const first = await request('POST', '/bidpilot/tenders/upload', headers, body);
    const again = await request('POST', '/bidpilot/tenders/upload', headers, body);
    return [first.status, again.status];
  }

  // The upload route checks CSRF, which needs the secret (as in upload.test.js).
  await t.test('upload: once per new tender, not for a duplicate or the team', { skip: !process.env.BIDPILOT_CSRF_SECRET && 'BIDPILOT_CSRF_SECRET not set' }, async () => {
    assert.deepEqual(await uploadAs('buyer@example.test'), [201, 200]);
    assert.deepEqual(await uploadAs(TEAM), [201, 200]);
    await settle(1500);
    assert.deepEqual(names(), ['upload']);
    assert.deepEqual(sent[0].params, { from: 'dashboard' });
  });

  await t.test('analysis_complete: once per completed analysis, never for a team company', async () => {
    setProvider({
      name: 'mock',
      async complete() {
        return JSON.stringify({ overview: {}, requirements: [], boq: [], dates: [], redFlags: [] });
      },
    });
    for (const email of ['buyer2@example.test', TEAM]) {
      const { user, company } = await createCompanyWithOwner(db, { companyName: `A ${email}`, userEmail: email, userName: 'U' });
      const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
      const tender = await createTender(scope, { title: 'x.pdf' });
      await insertPages(scope, tender.id, [{ pageNumber: 1, rawText: 'Tender text on page one.', ocrUsed: false }]);
      await runAnalysis(scope, tender.id, { isReanalysis: false });
    }
    await settle();
    assert.deepEqual(names(), ['analysis_complete']);
    assert.deepEqual(sent[0].params, { reanalysis: 'no' });
    assert.equal(sent[0].visitorId, null, 'a background event is tied to no visitor');
  });

  await t.test('plan_click: counted as /plan-click/<plan> and sent once; junk plans ignored', async () => {
    await postJson('/bidpilot/visit', { path: '/plan-click/starter' });
    await postJson('/bidpilot/visit', { path: '/plan-click/enterprise' });
    await postJson('/bidpilot/visit', { path: '/plan-click/contact' }, { cookie: 'bidpilot_staff=1' });
    await settle();
    const rows = (await db.execute('select path from page_views order by created_at')).rows.map((r) => r.path);
    assert.ok(rows.includes('/plan-click/starter'));
    assert.ok(!rows.includes('/plan-click/enterprise'), 'an unknown plan is not a route');
    assert.deepEqual(sent.map((e) => [e.name, e.params.plan]), [['plan_click', 'starter']]);
  });

  // ── Review fixes (M1, missing cases) ─────────────────────────────────────
  const MOCK_AI = {
    name: 'mock',
    async complete() {
      return JSON.stringify({ overview: {}, requirements: [], boq: [], dates: [], redFlags: [] });
    },
  };

  /** A signed-in member of a new company with a complete profile. */
  async function member(email) {
    const { user, company } = await createCompanyWithOwner(db, { companyName: `M ${email}`, userEmail: email, userName: 'U' });
    await completeProfile(company.id);
    const { rawToken, session } = await createSession(db, user.id);
    const auth = (extraCookie = '') => ({
      cookie: `${SESSION_COOKIE_NAME}=${rawToken}${extraCookie ? `; ${extraCookie}` : ''}`,
      'x-csrf-token': csrfTokenFor(session.tokenHash),
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    return { user, company, scope, auth };
  }

  async function sendPdf(urlPath, m, fields, extraCookie = '') {
    const boundary = `----t${Math.random().toString(16).slice(2)}`;
    const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    const body = Buffer.concat([
      ...parts,
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      await formattingPdf(), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return request('POST', urlPath, {
      'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length), ...m.auth(extraCookie),
    }, body);
  }

  async function waitForTender(m, tenderId, ok) {
    for (let i = 0; i < 100; i++) {
      const t2 = (await request('GET', `/bidpilot/tenders/${tenderId}?companyId=${m.company.id}`, m.auth())).json;
      if (ok(t2)) return t2;
      await settle(200);
    }
    throw new Error(`tender ${tenderId} never reached the expected state`);
  }

  const NEEDS_CSRF = { skip: !process.env.BIDPILOT_CSRF_SECRET && 'BIDPILOT_CSRF_SECRET not set' };

  await t.test('M1: a non-team account on a marked browser sends nothing, through sign-up, upload and the automatic analysis', NEEDS_CSRF, async () => {
    setProvider(MOCK_AI);
    const MARK = 'bidpilot_staff=1';
    // Sign-up from the marked browser.
    assert.equal((await postJson('/bidpilot/register', { email: 'tester2@example.test', password: 'a-long-password-1' }, { cookie: MARK })).status, 201);
    // Upload with the automatic analysis, from the marked browser.
    const m = await member('tester3@example.test');
    const up = await sendPdf('/bidpilot/tenders/upload', m, { companyId: m.company.id, autoAnalyze: 'trial' }, MARK);
    assert.equal(up.status, 201);
    assert.equal(up.json.autoAnalyze, true);
    const done = await waitForTender(m, up.json.tenderId, (x) => x?.analysisStatus === 'COMPLETED' || x?.analysisStatus === 'FAILED');
    assert.equal(done.analysisStatus, 'COMPLETED');
    await settle(300);
    assert.deepEqual(names(), [], 'no sign_up, upload or analysis_complete for the marked browser');

    // The same journey without the marker is counted (the control).
    const c = await member('buyer5@example.test');
    const upC = await sendPdf('/bidpilot/tenders/upload', c, { companyId: c.company.id, autoAnalyze: 'trial' });
    assert.equal(upC.status, 201);
    assert.equal((await waitForTender(c, upC.json.tenderId, (x) => x?.analysisStatus === 'COMPLETED')).analysisStatus, 'COMPLETED');
    await settle(300);
    assert.deepEqual(names(), ['upload', 'analysis_complete']);
    assert.deepEqual(sent[1].params, { reanalysis: 'no' });
  });

  await t.test('M1: an Analyze click from a marked browser sends no analysis_complete, even for a tender uploaded unmarked', NEEDS_CSRF, async () => {
    setProvider(MOCK_AI);
    const m = await member('tester4@example.test');
    const up = await sendPdf('/bidpilot/tenders/upload', m, { companyId: m.company.id });
    assert.equal(up.status, 201);
    await waitForTender(m, up.json.tenderId, (x) => x?.processingStatus === 'COMPLETED');
    const body = Buffer.from(JSON.stringify({ companyId: m.company.id }));
    const start = await request('POST', `/bidpilot/tenders/${up.json.tenderId}/analyze`, {
      'content-type': 'application/json', 'content-length': body.length, ...m.auth('bidpilot_staff=1'),
    }, body);
    assert.equal(start.status, 202);
    assert.equal((await waitForTender(m, up.json.tenderId, (x) => x?.analysisStatus === 'COMPLETED')).analysisStatus, 'COMPLETED');
    await settle(300);
    assert.deepEqual(names(), ['upload'], 'the unmarked upload counts; the marked analysis does not');
  });

  await t.test('analysis_complete says whether it was a re-run', async () => {
    setProvider(MOCK_AI);
    const m = await member('buyer6@example.test');
    const tender = await createTender(m.scope, { title: 'x.pdf' });
    await insertPages(m.scope, tender.id, [{ pageNumber: 1, rawText: 'Tender text on page one.', ocrUsed: false }]);
    await runAnalysis(m.scope, tender.id, { isReanalysis: false });
    await runAnalysis(m.scope, tender.id, { isReanalysis: true });
    await settle();
    assert.deepEqual(sent.map((e) => [e.name, e.params.reanalysis]), [['analysis_complete', 'no'], ['analysis_complete', 'yes']]);
  });

  await t.test('upload from a tracked tender: once, labelled tracked_tender; not again, not for the team', NEEDS_CSRF, async () => {
    for (const email of ['buyer7@example.test', TEAM]) {
      const m = await member(email);
      const tracked = await createTender(m.scope, { title: 'Tracked from the feed' });
      const first = await sendPdf(`/bidpilot/tenders/${tracked.id}/document`, m, { companyId: m.company.id });
      assert.equal(first.status, 201);
      const again = await sendPdf(`/bidpilot/tenders/${tracked.id}/document`, m, { companyId: m.company.id });
      assert.equal(again.status, 409, 'a second document is refused');
    }
    await settle(1500);
    assert.deepEqual(sent.map((e) => [e.name, e.params.from]), [['upload', 'tracked_tender']]);
  });
});
