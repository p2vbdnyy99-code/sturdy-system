// Milestone 5a — company creation (onboarding) and company profile
// read/write. POST /companies closes the real product gap the M5 audit
// found: createCompanyWithOwner() (used everywhere else in this test suite)
// creates a NEW user too, which is the wrong shape for an already-logged-in
// person onboarding their first company.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { registerUser } from '../../src/bidpilot/repo/users.js';
import { createCompanyForUser, getCompanyProfile } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createCompaniesRouter } from '../../src/bidpilot/routes/companies.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

// ── Repo-level: createCompanyForUser() ──────────────────────────────────────

test('createCompanyForUser (repo-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  await t.test('creates a company and makes the given user its owner in one call', async () => {
    const { user } = await registerUser(db, { email: 'owner@example.com', password: 'a-real-password-123' });
    const { company, membership } = await createCompanyForUser(db, user.id, { name: 'Acme Constructions' });
    assert.equal(company.name, 'Acme Constructions');
    assert.equal(membership.role, 'owner');
    assert.equal(membership.userId, user.id);

    // The new membership actually grants access — proves this isn't just an
    // insert that happens to look right.
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    assert.equal(scope.companyId, company.id);
  });

  await t.test('industry/businessType land on the lazily-created company_profiles row, not on companies', async () => {
    const { user } = await registerUser(db, { email: 'profile@example.com', password: 'a-real-password-123' });
    const { company } = await createCompanyForUser(db, user.id, {
      name: 'Beta Infra', industry: 'Construction', businessType: 'Private Limited',
    });
    const profile = await getCompanyProfile(db, company.id);
    assert.equal(profile.industry, 'Construction');
    assert.equal(profile.businessType, 'Private Limited');
  });

  await t.test('no company_profiles row is created when industry/businessType are omitted', async () => {
    const { user } = await registerUser(db, { email: 'noprofile@example.com', password: 'a-real-password-123' });
    const { company } = await createCompanyForUser(db, user.id, { name: 'Gamma Co' });
    const profile = await getCompanyProfile(db, company.id);
    assert.equal(profile, undefined);
  });
});

// ── HTTP integration ─────────────────────────────────────────────────────────

test('POST /companies, GET/PATCH /companies/:id/profile (HTTP integration)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createCompaniesRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    await closeTestDb();
  });

  let userA, authA;

  async function mintAuth(userId) {
    const { rawToken, session } = await createSession(db, userId);
    return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  }

  t.beforeEach(async () => {
    await truncateAll();
    const { user } = await registerUser(db, { email: 'onboarding@example.com', password: 'a-real-password-123' });
    userA = user;
    authA = await mintAuth(userA.id);
  });

  function req(method, path, { body, auth } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...(auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}` } : {}),
        ...(auth?.csrf ? { 'x-csrf-token': auth.csrf } : {}),
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

  await t.test('a freshly-registered (even unverified) user can create a company — onboarding is not gated on email verification', async () => {
    assert.equal(userA.status, 'PENDING_VERIFICATION');
    const res = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: 'New Co' } });
    assert.equal(res.status, 201);
    assert.equal(res.json.name, 'New Co');
    assert.equal(res.json.role, 'owner');
  });

  await t.test('requires authentication', async () => {
    const res = await req('POST', '/bidpilot/companies', { body: { name: 'No Auth Co' } });
    assert.equal(res.status, 401);
  });

  await t.test('requires CSRF token on the mutating create', async () => {
    const res = await req('POST', '/bidpilot/companies', {
      auth: { cookie: authA.cookie }, // deliberately omit csrf
      body: { name: 'No CSRF Co' },
    });
    assert.equal(res.status, 403);
  });

  await t.test('rejects a missing/blank company name with 400', async () => {
    const missing = await req('POST', '/bidpilot/companies', { auth: authA, body: {} });
    assert.equal(missing.status, 400);
    const blank = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: '   ' } });
    assert.equal(blank.status, 400);
  });

  await t.test('profile: reading before any profile exists returns null, not 404 or an error', async () => {
    const created = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: 'Profile Co' } });
    const res = await req('GET', `/bidpilot/companies/${created.json.companyId}/profile`, { auth: authA });
    assert.equal(res.status, 200);
    assert.equal(res.json, null);
  });

  await t.test('profile: PATCH creates it lazily, then progressive PATCHes merge rather than overwrite', async () => {
    const created = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: 'Progressive Co' } });
    const companyId = created.json.companyId;

    const first = await req('PATCH', `/bidpilot/companies/${companyId}/profile`, {
      auth: authA, body: { industry: 'Construction' },
    });
    assert.equal(first.status, 200);
    assert.equal(first.json.industry, 'Construction');

    const second = await req('PATCH', `/bidpilot/companies/${companyId}/profile`, {
      auth: authA, body: { yearsInBusiness: 5 },
    });
    assert.equal(second.status, 200);
    assert.equal(second.json.industry, 'Construction', 'earlier field survives an unrelated later PATCH');
    assert.equal(second.json.yearsInBusiness, 5);
  });

  await t.test('profile: an unknown field in the PATCH body is silently ignored, never written', async () => {
    const created = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: 'Whitelist Co' } });
    const res = await req('PATCH', `/bidpilot/companies/${created.json.companyId}/profile`, {
      auth: authA, body: { industry: 'Construction', notARealColumn: 'malicious' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.notARealColumn, undefined);
  });

  await t.test('a caller cannot read or write another company\'s profile (403, not 404 — indistinguishable from tenant-access denial elsewhere)', async () => {
    const created = await req('POST', '/bidpilot/companies', { auth: authA, body: { name: 'Owned By A' } });
    const { user: userB } = await registerUser(db, { email: 'outsider@example.com', password: 'a-real-password-123' });
    const authB = await mintAuth(userB.id);

    const readRes = await req('GET', `/bidpilot/companies/${created.json.companyId}/profile`, { auth: authB });
    assert.equal(readRes.status, 403);

    const writeRes = await req('PATCH', `/bidpilot/companies/${created.json.companyId}/profile`, {
      auth: authB, body: { industry: 'Hijacked' },
    });
    assert.equal(writeRes.status, 403);
  });
});
