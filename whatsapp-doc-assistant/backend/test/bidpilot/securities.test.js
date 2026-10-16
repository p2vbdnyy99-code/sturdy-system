// EMD and performance security (repo/securities.js): validation without a
// database, then the tender routes and the dashboard overview over HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { parseSecurity, securitiesOverview, istToday } from '../../src/bidpilot/repo/securities.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createDashboardRouter } from '../../src/bidpilot/routes/dashboard.js';

test('parseSecurity: what a create and an edit accept', () => {
  assert.deepEqual(parseSecurity({ kind: 'EMD', mode: 'BG', amount: '₹1,27,300', issuedOn: '2026-10-01', validUntil: '2027-01-31' }), {
    ok: true, values: { kind: 'EMD', mode: 'BG', amount: '127300.00', issuedOn: '2026-10-01', validUntil: '2027-01-31' },
  });
  assert.equal(parseSecurity({ kind: 'EMD', mode: 'EXEMPTED' }).ok, true, 'an MSE exemption needs no amount');
  assert.match(parseSecurity({ mode: 'BG' }).error, /EMD or performance/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'CHEQUE' }).error, /how it is given/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'DD', amount: 'about one lakh' }).error, /number of rupees/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'DD', amount: -5 }).error, /number of rupees/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'BG', validUntil: '2026-02-30' }).error, /real dates/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'BG', issuedOn: '2026-10-10', validUntil: '2026-10-01' }).error, /before the issue/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'BG', validUntil: '2026-12-01', claimUntil: '2026-11-01' }).error, /before the expiry/);
  assert.match(parseSecurity({ kind: 'EMD', mode: 'BG', bank: 'x'.repeat(121) }).error, /under 120/);
  assert.deepEqual(parseSecurity({ status: 'RETURNED' }, { partial: true }), { ok: true, values: { status: 'RETURNED' } });
  assert.match(parseSecurity({ status: 'LOST' }, { partial: true }).error, /Unknown status/);
  assert.deepEqual(parseSecurity({ reference: '  ', amount: '' }, { partial: true }), { ok: true, values: { reference: null, amount: null } });
});

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('EMD and bank guarantees (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let user; let auth; let scope; let tender;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createTendersRouter());
    app.use('/bidpilot', createDashboardRouter());
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });
  t.beforeEach(async () => {
    await truncateAll();
    const a = await createCompanyWithOwner(db, { companyName: 'EMD Co', userEmail: 'emd@example.com', userName: 'E' });
    company = a.company; user = a.user;
    const { rawToken, session } = await createSession(db, user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    tender = await createTender(scope, { title: 'road.pdf', tenderNumber: 'PWD/2026/7', organization: 'PWD' });
  });

  function req(method, path, body, who = auth) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${who.cookie}`, 'x-csrf-token': who.csrf,
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
      };
      const r = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
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
  const base = () => `/bidpilot/tenders/${tender.id}/securities`;
  const daysFrom = (n) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  await t.test('add, list, edit and delete an EMD', async () => {
    const created = await req('POST', base(), { companyId: company.id, kind: 'EMD', mode: 'DD', amount: 127300, reference: 'DD 004512', bank: 'SBI' });
    assert.equal(created.status, 201);
    assert.equal(created.json.amount, 127300);
    assert.equal(created.json.status, 'TO_ARRANGE');
    const list = await req('GET', `${base()}?companyId=${company.id}`);
    assert.deepEqual(list.json.securities.map((s) => [s.kind, s.mode, s.amount, s.reference]), [['EMD', 'DD', 127300, 'DD 004512']]);
    const edited = await req('PATCH', `${base()}/${created.json.id}`, { companyId: company.id, status: 'SUBMITTED' });
    assert.equal(edited.json.status, 'SUBMITTED');
    assert.equal(edited.json.amount, 127300, 'fields not sent are kept');
    assert.equal((await req('PATCH', `${base()}/${created.json.id}`, { companyId: company.id, mode: 'CHEQUE' })).status, 400);
    assert.equal((await req('DELETE', `${base()}/${created.json.id}?companyId=${company.id}`)).json.deleted, true);
    assert.deepEqual((await req('GET', `${base()}?companyId=${company.id}`)).json.securities, []);
    assert.equal((await req('DELETE', `${base()}/${created.json.id}?companyId=${company.id}`)).status, 404);
  });

  await t.test('bad input is refused, and a tender holds at most 10 entries', async () => {
    assert.equal((await req('POST', base(), { companyId: company.id, kind: 'EMD' })).status, 400);
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await req('POST', base(), { companyId: company.id, kind: 'EMD', mode: 'ONLINE' })).status, 201);
    }
    const eleventh = await req('POST', base(), { companyId: company.id, kind: 'EMD', mode: 'ONLINE' });
    assert.equal(eleventh.status, 400);
    assert.match(eleventh.json.error, /at most 10/);
  });

  await t.test('another company can neither see nor change them', async () => {
    const mine = await req('POST', base(), { companyId: company.id, kind: 'EMD', mode: 'BG', amount: 50000 });
    const b = await createCompanyWithOwner(db, { companyName: 'Other Co', userEmail: 'other@example.com', userName: 'O' });
    const { rawToken, session } = await createSession(db, b.user.id);
    const other = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    assert.equal((await req('GET', `${base()}?companyId=${company.id}`, null, other)).status, 403, 'not a member');
    assert.equal((await req('GET', `${base()}?companyId=${b.company.id}`, null, other)).status, 404, 'not their tender');
    assert.equal((await req('PATCH', `${base()}/${mine.json.id}`, { companyId: b.company.id, status: 'RETURNED' }, other)).status, 404);
    // Their own tender can't reach our entry either.
    const otherScope = await requireCompanyAccess(db, { userId: b.user.id, companyId: b.company.id });
    const theirs = await createTender(otherScope, { title: 'theirs.pdf' });
    assert.equal((await req('PATCH', `/bidpilot/tenders/${theirs.id}/securities/${mine.json.id}`, { companyId: b.company.id, status: 'RETURNED' }, other)).status, 404);
    assert.equal((await req('GET', `${base()}?companyId=${company.id}`)).json.securities[0].status, 'TO_ARRANGE');
    assert.equal((await req('GET', `/bidpilot/dashboard/securities?companyId=${b.company.id}`, null, other)).json.held.count, 0);
  });

  await t.test('dashboard: money still held, guarantees expiring within 30 days and already expired', async () => {
    const add = (body) => req('POST', base(), { companyId: company.id, ...body });
    await add({ kind: 'EMD', mode: 'BG', amount: 100000, status: 'SUBMITTED', validUntil: daysFrom(10) });
    await add({ kind: 'PERFORMANCE', mode: 'BG', amount: 250000, status: 'SUBMITTED', validUntil: daysFrom(-3) });
    await add({ kind: 'EMD', mode: 'DD', amount: 40000, status: 'SUBMITTED' });
    await add({ kind: 'EMD', mode: 'BG', amount: 60000, status: 'SUBMITTED', validUntil: daysFrom(90) });
    await add({ kind: 'EMD', mode: 'ONLINE', status: 'SUBMITTED' });
    await add({ kind: 'EMD', mode: 'DD', amount: 999999, status: 'RETURNED' });
    await add({ kind: 'EMD', mode: 'DD', amount: 888888, status: 'TO_ARRANGE' });
    await add({ kind: 'EMD', mode: 'EXEMPTED', amount: 777777, status: 'SUBMITTED' });
    const { json } = await req('GET', `/bidpilot/dashboard/securities?companyId=${company.id}`);
    assert.equal(json.held.count, 5, 'submitted entries that hold money');
    assert.equal(json.held.amount, 450000);
    assert.equal(json.held.unknownAmounts, 1);
    assert.deepEqual(json.expiringSoon.map((s) => s.amount), [100000]);
    assert.equal(json.expiringSoon[0].tenderId, tender.id);
    assert.equal(json.expiringSoon[0].tenderNumber, 'PWD/2026/7');
    assert.deepEqual(json.expired.map((s) => s.amount), [250000]);
    const direct = await securitiesOverview(scope, istToday());
    assert.equal(direct.held.amount, 450000);
  });
});
