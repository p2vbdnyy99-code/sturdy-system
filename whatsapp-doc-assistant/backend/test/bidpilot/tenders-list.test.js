// Milestone 5a — GET /bidpilot/tenders: the paginated, filterable, sortable
// tender list the dashboard's main table reads from. Repo-level coverage for
// listTendersPaginated() plus HTTP integration for validation/tenant
// isolation, over real Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, listTendersPaginated, updateTenderStatus, startAnalysis } from '../../src/bidpilot/repo/tenders.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

// ── Repo-level: listTendersPaginated() ──────────────────────────────────────

test('listTendersPaginated (repo-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  async function scopeFor(companyName) {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName, userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    return { scope: await requireCompanyAccess(db, { userId: user.id, companyId: company.id }), company };
  }

  await t.test('an empty company returns an empty page with total 0', async () => {
    const { scope } = await scopeFor('Empty Co');
    const result = await listTendersPaginated(scope, {});
    assert.deepEqual(result.tenders, []);
    assert.equal(result.total, 0);
  });

  await t.test('pagination: limit and total are honored across pages', async () => {
    const { scope } = await scopeFor('Paginated Co');
    for (let i = 0; i < 5; i++) await createTender(scope, { title: `Tender ${i}` });

    const page1 = await listTendersPaginated(scope, { page: 1, limit: 2 });
    assert.equal(page1.tenders.length, 2);
    assert.equal(page1.total, 5);

    const page3 = await listTendersPaginated(scope, { page: 3, limit: 2 });
    assert.equal(page3.tenders.length, 1, 'last page has the remainder');
  });

  await t.test('limit is capped at 100 even if a caller asks for more', async () => {
    const { scope } = await scopeFor('Cap Co');
    const result = await listTendersPaginated(scope, { limit: 9999 });
    assert.equal(result.limit, 100);
  });

  await t.test('filters by status', async () => {
    const { scope } = await scopeFor('Filter Co');
    const t1 = await createTender(scope, { title: 'A' });
    await createTender(scope, { title: 'B' });
    await updateTenderStatus(scope, t1.id, 'INTERESTED');

    const result = await listTendersPaginated(scope, { status: 'INTERESTED' });
    assert.equal(result.tenders.length, 1);
    assert.equal(result.tenders[0].id, t1.id);
  });

  await t.test('filters by analysisStatus', async () => {
    const { scope } = await scopeFor('Analysis Filter Co');
    await createTender(scope, { title: 'A' });
    const result = await listTendersPaginated(scope, { analysisStatus: 'NOT_STARTED' });
    assert.equal(result.tenders.length, 1);
  });

  await t.test('search matches title, organization, or tenderNumber (case-insensitive)', async () => {
    const { scope } = await scopeFor('Search Co');
    await createTender(scope, { title: 'Road Construction Tender', organization: 'NHAI' });
    await createTender(scope, { title: 'Bridge Tender', organization: 'PWD', tenderNumber: 'PWD/2026/44' });

    const byTitle = await listTendersPaginated(scope, { search: 'road' });
    assert.equal(byTitle.tenders.length, 1);

    const byOrg = await listTendersPaginated(scope, { search: 'pwd' });
    assert.equal(byOrg.tenders.length, 1);

    const byTenderNumber = await listTendersPaginated(scope, { search: '2026/44' });
    assert.equal(byTenderNumber.tenders.length, 1);

    const noMatch = await listTendersPaginated(scope, { search: 'nonexistent' });
    assert.equal(noMatch.tenders.length, 0);
  });

  await t.test('sorts by createdAt in both directions', async () => {
    const { scope } = await scopeFor('Sort Co');
    const first = await createTender(scope, { title: 'First' });
    await new Promise((r) => setTimeout(r, 10));
    const second = await createTender(scope, { title: 'Second' });

    const asc = await listTendersPaginated(scope, { sortBy: 'createdAt', sortOrder: 'asc' });
    assert.deepEqual(asc.tenders.map((t) => t.id), [first.id, second.id]);

    const desc = await listTendersPaginated(scope, { sortBy: 'createdAt', sortOrder: 'desc' });
    assert.deepEqual(desc.tenders.map((t) => t.id), [second.id, first.id]);
  });

  await t.test('sorting by deadline puts tenders with no deadline last (ascending)', async () => {
    const { scope } = await scopeFor('Deadline Sort Co');
    const noDeadline = await createTender(scope, { title: 'No deadline' });
    const withDeadline = await createTender(scope, {
      title: 'Has deadline', submissionDeadline: new Date(Date.now() + 86_400_000),
    });
    const result = await listTendersPaginated(scope, { sortBy: 'deadline', sortOrder: 'asc' });
    assert.equal(result.tenders[0].id, withDeadline.id);
    assert.equal(result.tenders[1].id, noDeadline.id);
  });

  await t.test('is scoped per company — never leaks another company\'s tenders', async () => {
    const { scope: scopeA } = await scopeFor('Isolation A');
    const { scope: scopeB } = await scopeFor('Isolation B');
    await createTender(scopeA, { title: 'Company A tender' });
    await createTender(scopeB, { title: 'Company B tender' });

    const resultA = await listTendersPaginated(scopeA, {});
    assert.equal(resultA.tenders.length, 1);
    assert.equal(resultA.tenders[0].title, 'Company A tender');
  });
});

// ── HTTP integration ─────────────────────────────────────────────────────────

test('GET /tenders (HTTP integration)', { skip: SKIP_REASON }, async (t) => {
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

  let userA, companyA, authA;

  async function mintAuth(userId) {
    const { rawToken, session } = await createSession(db, userId);
    return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  }

  t.beforeEach(async () => {
    await truncateAll();
    const a = await createCompanyWithOwner(db, { companyName: 'List HTTP Co', userEmail: 'a@list.example', userName: 'A' });
    userA = a.user; companyA = a.company;
    authA = await mintAuth(userA.id);
  });

  function req(method, path, { auth } = {}) {
    return new Promise((resolve, reject) => {
      const headers = auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {};
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
      r.end();
    });
  }

  await t.test('requires authentication', async () => {
    const res = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}`);
    assert.equal(res.status, 401);
  });

  await t.test('an empty company returns an empty list, not an error', async () => {
    const res = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.tenders, []);
    assert.equal(res.json.total, 0);
  });

  await t.test('rejects an invalid status filter with 400, not a DB error', async () => {
    const res = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}&status=NOT_A_REAL_STATUS`, { auth: authA });
    assert.equal(res.status, 400);
  });

  await t.test('rejects an invalid analysisStatus filter with 400', async () => {
    const res = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}&analysisStatus=BOGUS`, { auth: authA });
    assert.equal(res.status, 400);
  });

  await t.test('rejects an invalid sortBy/sortOrder with 400', async () => {
    const badSortBy = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}&sortBy=title`, { auth: authA });
    assert.equal(badSortBy.status, 400);
    const badSortOrder = await req('GET', `/bidpilot/tenders?companyId=${companyA.id}&sortOrder=sideways`, { auth: authA });
    assert.equal(badSortOrder.status, 400);
  });

  await t.test('a caller cannot list another company\'s tenders by naming its id (403)', async () => {
    const b = await createCompanyWithOwner(db, { companyName: 'List HTTP Co B', userEmail: 'b@list.example', userName: 'B' });
    const res = await req('GET', `/bidpilot/tenders?companyId=${b.company.id}`, { auth: authA });
    assert.equal(res.status, 403);
  });
});
