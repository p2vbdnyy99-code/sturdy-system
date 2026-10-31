// Client workspaces: a consultant's clients, their profiles, tenders marked
// for a client, and eligibility checked against the client's profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll, completeProfile } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence } from '../../src/bidpilot/repo/requirements.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setProvider } from '../../src/ai/index.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createCompaniesRouter } from '../../src/bidpilot/routes/companies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

const FULL_PROFILE = {
  industry: 'Bridge works', businessType: 'Partnership', gstin: '27ABCDE1234F1Z5', registrationDetails: 'Class A',
  yearsInBusiness: 9, annualTurnover: '90000000', netWorth: '30000000', employeeCount: 60,
  geography: ['Maharashtra'], certifications: ['ISO 9001'], licenses: [], equipment: ['Crane'], oemRelationships: [],
  experience: [{ description: 'Steel bridge', value: '4 crore', year: '2024', client: 'MSRDC' }],
  otherQualifications: null, noneFields: ['licenses', 'oemRelationships', 'otherQualifications'],
};

test('client workspaces (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let auth; let scope; let prompts = [];

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    setProvider({
      name: 'mock',
      async complete({ user }) {
        prompts.push(user);
        return JSON.stringify({ results: [] });
      },
    });
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createCompaniesRouter());
    app.use('/bidpilot', createTendersRouter());
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
    const a = await createCompanyWithOwner(db, { companyName: 'Consult Co', userEmail: 'c@example.com', userName: 'C' });
    company = a.company;
    const { rawToken, session } = await createSession(db, a.user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: a.user.id, companyId: company.id });
    prompts = [];
  });

  function req(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf,
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
  const base = () => `/bidpilot/companies/${company.id}/clients`;

  await t.test('clients are created, listed with their profile status, renamed and deleted', async () => {
    const a = await req('POST', base(), { name: '  Patil   Infra ' });
    assert.equal(a.status, 201);
    assert.equal(a.json.name, 'Patil Infra');
    assert.equal(a.json.profileComplete, false);
    assert.equal((await req('POST', base(), { name: 'Patil Infra' })).status, 409, 'names are unique per company');
    assert.equal((await req('POST', base(), { name: ' ' })).status, 400);
    await req('POST', base(), { name: 'Ankur Electricals' });
    let list = await req('GET', base());
    assert.deepEqual(list.json.clients.map((c) => c.name), ['Ankur Electricals', 'Patil Infra']);
    const p = await req('PATCH', `${base()}/${a.json.id}/profile`, FULL_PROFILE);
    assert.deepEqual(p.json.missing, []);
    list = await req('GET', base());
    assert.equal(list.json.clients.find((c) => c.name === 'Patil Infra').profileComplete, true);
    assert.equal((await req('PATCH', `${base()}/${a.json.id}`, { name: 'Patil Infra Pvt Ltd' })).json.name, 'Patil Infra Pvt Ltd');
    assert.equal((await req('DELETE', `${base()}/${a.json.id}`)).status, 200);
    assert.equal((await req('GET', base())).json.clients.length, 1);
    const left = (await db.execute(`select count(*)::int n from client_profiles`)).rows[0].n;
    assert.equal(left, 0, 'the profile goes with the client');
  });

  await t.test("another company's clients can't be seen or used", async () => {
    const other = await createCompanyWithOwner(db, { companyName: 'Other', userEmail: 'o@example.com', userName: 'O' });
    const otherScope = await requireCompanyAccess(db, { userId: other.user.id, companyId: other.company.id });
    const [theirs] = (await db.execute(`insert into clients (company_id, name) values ('${other.company.id}', 'Secret client') returning id`)).rows;
    assert.equal((await req('GET', `/bidpilot/companies/${other.company.id}/clients`)).status, 403);
    assert.equal((await req('GET', `${base()}/${theirs.id}/profile`)).status, 404);
    assert.equal((await req('PATCH', `${base()}/${theirs.id}/profile`, { industry: 'x' })).status, 404);
    const mine = await createTender(scope, { title: 'mine.pdf' });
    assert.equal((await req('PATCH', `/bidpilot/tenders/${mine.id}`, { companyId: company.id, clientId: theirs.id })).status, 400);
    void otherScope;
  });

  await t.test('tenders can be marked for a client and filtered by client', async () => {
    const c = (await req('POST', base(), { name: 'Patil Infra' })).json;
    const t1 = await createTender(scope, { title: 'one.pdf' });
    await createTender(scope, { title: 'two.pdf' });
    const set = await req('PATCH', `/bidpilot/tenders/${t1.id}`, { companyId: company.id, clientId: c.id });
    assert.equal(set.json.clientId, c.id);
    const forClient = await req('GET', `/bidpilot/tenders?companyId=${company.id}&clientId=${c.id}`);
    assert.deepEqual(forClient.json.tenders.map((x) => x.title), ['one.pdf']);
    const own = await req('GET', `/bidpilot/tenders?companyId=${company.id}&clientId=none`);
    assert.deepEqual(own.json.tenders.map((x) => x.title), ['two.pdf']);
    assert.equal((await req('GET', `/bidpilot/tenders?companyId=${company.id}&clientId=bogus`)).status, 400);
    await req('DELETE', `${base()}/${c.id}`);
    const after = (await db.execute(`select client_id from tenders where id = '${t1.id}'`)).rows[0];
    assert.equal(after.client_id, null, 'deleting a client keeps its tenders, as the company\'s own');
  });

  await t.test('eligibility is checked against the client\'s profile, not the company\'s', async () => {
    await completeProfile(company.id); // the company's own profile (industry "Civil construction" or similar)
    const c = (await req('POST', base(), { name: 'Bridge Co' })).json;
    const tender = await createTender(scope, { title: 'bridge.pdf', clientId: c.id });
    await createRequirementWithEvidence(scope, tender.id, { category: 'EXPERIENCE', description: 'One similar bridge work' },
      [{ sourcePage: 2, evidenceText: 'One similar bridge work' }]);

    const before = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { companyId: company.id });
    assert.equal(before.status, 200);
    assert.equal(prompts.length, 0, 'no AI call while the client has no profile');
    assert.match(before.json.requirements[0].actionRequired, /this client's profile/);

    await req('PATCH', `${base()}/${c.id}/profile`, FULL_PROFILE);
    await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { companyId: company.id });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Bridge works/, 'the client\'s profile is sent');
  });
});
