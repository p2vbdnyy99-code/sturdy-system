// Milestone 5a — GET /bidpilot/dashboard/summary: the "what needs attention"
// aggregate. Computed server-side (see repo/tenders.js's getDashboardSummary
// docblock) — these tests exist to pin down the exact bucketing rules against
// real Postgres, since a `filter (where ...)` aggregate query is easy to get
// subtly wrong in a way plain JS tests over an in-memory list wouldn't catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, updateProcessingStatus, getDashboardSummary } from '../../src/bidpilot/repo/tenders.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createDashboardRouter } from '../../src/bidpilot/routes/dashboard.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

// ── Repo-level: getDashboardSummary() ───────────────────────────────────────

test('getDashboardSummary (repo-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  async function scopeFor(companyName) {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName, userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    return requireCompanyAccess(db, { userId: user.id, companyId: company.id });
  }

  await t.test('an empty company gets all-zero counts, not an error', async () => {
    const scope = await scopeFor('Empty Co');
    const summary = await getDashboardSummary(scope);
    assert.equal(summary.totalTenders, 0);
    assert.equal(summary.processing, 0);
    assert.equal(summary.awaitingAnalysis, 0);
    assert.equal(summary.analysed, 0);
    assert.equal(summary.upcomingDeadlines.count, 0);
    assert.deepEqual(summary.recentTenders, []);
  });

  await t.test('buckets tenders correctly by processing/analysis status', async () => {
    const scope = await scopeFor('Bucket Co');
    const uploaded = await createTender(scope, { title: 'Uploaded' }); // stays UPLOADED
    const completedNotAnalyzed = await createTender(scope, { title: 'Awaiting analysis' });
    await updateProcessingStatus(scope, completedNotAnalyzed.id, 'COMPLETED');

    const summary = await getDashboardSummary(scope);
    assert.equal(summary.totalTenders, 2);
    assert.equal(summary.processing, 1, 'the still-UPLOADED tender counts as processing');
    assert.equal(summary.awaitingAnalysis, 1, 'COMPLETED processing + NOT_STARTED analysis');
    assert.equal(summary.analysed, 0);
  });

  await t.test('upcomingDeadlines counts only future deadlines within the window, not past or far-future ones', async () => {
    const scope = await scopeFor('Deadline Co');
    await createTender(scope, { title: 'Due soon', submissionDeadline: new Date(Date.now() + 3 * 86_400_000) });
    await createTender(scope, { title: 'Due far away', submissionDeadline: new Date(Date.now() + 90 * 86_400_000) });
    await createTender(scope, { title: 'Already past', submissionDeadline: new Date(Date.now() - 86_400_000) });
    await createTender(scope, { title: 'No deadline' });

    const summary = await getDashboardSummary(scope, { upcomingWithinDays: 14 });
    assert.equal(summary.upcomingDeadlines.count, 1);
    assert.equal(summary.upcomingDeadlines.withinDays, 14);
  });

  await t.test('recentTenders returns at most 5, newest first', async () => {
    const scope = await scopeFor('Recent Co');
    for (let i = 0; i < 7; i++) {
      await createTender(scope, { title: `Tender ${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }
    const summary = await getDashboardSummary(scope);
    assert.equal(summary.recentTenders.length, 5);
    assert.equal(summary.recentTenders[0].title, 'Tender 6', 'most recently created first');
  });

  await t.test('is scoped per company', async () => {
    const scopeA = await scopeFor('Summary Isolation A');
    const scopeB = await scopeFor('Summary Isolation B');
    await createTender(scopeA, { title: 'A tender' });

    const summaryA = await getDashboardSummary(scopeA);
    const summaryB = await getDashboardSummary(scopeB);
    assert.equal(summaryA.totalTenders, 1);
    assert.equal(summaryB.totalTenders, 0);
  });
});

// ── HTTP integration ─────────────────────────────────────────────────────────

test('GET /dashboard/summary (HTTP integration)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createDashboardRouter());
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
    const a = await createCompanyWithOwner(db, { companyName: 'Summary HTTP Co', userEmail: 'a@summary.example', userName: 'A' });
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
    const res = await req('GET', `/bidpilot/dashboard/summary?companyId=${companyA.id}`);
    assert.equal(res.status, 401);
  });

  await t.test('returns the summary shape for an authenticated member', async () => {
    const res = await req('GET', `/bidpilot/dashboard/summary?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 200);
    assert.equal(res.json.totalTenders, 0);
    assert.ok('upcomingDeadlines' in res.json);
    assert.ok(Array.isArray(res.json.recentTenders));
  });

  await t.test('a caller cannot read another company\'s summary by naming its id (403)', async () => {
    const b = await createCompanyWithOwner(db, { companyName: 'Summary HTTP Co B', userEmail: 'b@summary.example', userName: 'B' });
    const res = await req('GET', `/bidpilot/dashboard/summary?companyId=${b.company.id}`, { auth: authA });
    assert.equal(res.status, 403);
  });
});
