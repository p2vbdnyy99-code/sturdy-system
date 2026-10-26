// The mandatory company profile, over HTTP: upload and analyse are refused
// until it's complete, the profile API reports what's missing and accepts
// "None" answers, and /me tells the app whether to send the user there first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll, completeProfile } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender as createTenderRow, updateProcessingStatus } from '../../src/bidpilot/repo/tenders.js';
import { attachTestDocument } from '../db/helpers.js';
// Real uploads always have a document; analysis refuses a tender without one.
const createTender = async (scope, fields) => {
  const t = await createTenderRow(scope, fields);
  await attachTestDocument(t.id);
  return t;
};
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createCompaniesRouter } from '../../src/bidpilot/routes/companies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';

// Sessions need the CSRF secret, as in the other HTTP tests.
const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('company profile: optional for the first 3 tenders, then required (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let auth;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-'));
    setStorage(new LocalDiskStorage({ dir, publicBaseUrl: 'http://localhost', signingSecret: 'gate-test-secret' }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
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
    const a = await createCompanyWithOwner(db, { companyName: 'Gate Co', userEmail: 'gate@example.com', userName: 'G' });
    company = a.company;
    const { rawToken, session } = await createSession(db, a.user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  });

  function req(method, path, { body, raw, contentType } = {}) {
    return new Promise((resolve, reject) => {
      const payload = raw ?? (body ? Buffer.from(JSON.stringify(body)) : null);
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf,
        ...(payload ? { 'content-type': contentType ?? 'application/json', 'content-length': String(payload.length) } : {}),
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

  function uploadFile(name, body) {
    const boundary = '----gate' + Math.random().toString(16).slice(2);
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from(body),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return req('POST', '/bidpilot/tenders/upload', { raw, contentType: `multipart/form-data; boundary=${boundary}` });
  }

  function upload(name = 't.pdf', body = '%PDF-1.4\n%%EOF\n') {
    return uploadFile(name, body);
  }

  async function processedTender(title) {
    const scope = await requireCompanyAccess(db, { userId: (await db.execute('select id from users limit 1')).rows[0].id, companyId: company.id });
    const tender = await createTender(scope, { title });
    await insertPages(scope, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }]);
    await updateProcessingStatus(scope, tender.id, 'COMPLETED');
    return tender;
  }

  const analyse = (id) => req('POST', `/bidpilot/tenders/${id}/analyze`, { body: { companyId: company.id } });
  const analysisStatus = async (id) => (await db.execute(`select analysis_status from tenders where id = '${id}'`)).rows[0].analysis_status;

  await t.test('the first 3 uploads need no profile; the 4th is refused with 409 and the missing fields', async () => {
    assert.equal((await upload('a.pdf', '%PDF-1.4\n% a\n%%EOF\n')).status, 201);
    assert.equal((await upload('b.pdf', '%PDF-1.4\n% b\n%%EOF\n')).status, 201);
    assert.equal((await upload('c.pdf', '%PDF-1.4\n% c\n%%EOF\n')).status, 201);
    const fourth = await upload('d.pdf', '%PDF-1.4\n% d\n%%EOF\n');
    assert.equal(fourth.status, 409);
    assert.equal(fourth.json.code, 'profile_incomplete');
    assert.equal(fourth.json.freeTenders, 3);
    assert.ok(fourth.json.missing.includes('annualTurnover'));
    assert.match(fourth.json.error, /added 3 tenders without a company profile/);
    const count = (await db.execute(`select count(*)::int n from tenders where company_id = '${company.id}'`)).rows[0].n;
    assert.equal(count, 3, 'the refused upload stored nothing');
  });

  await t.test('analysing one of the first 3 tenders needs no profile; a 4th tender is refused and nothing starts', async () => {
    const first = await processedTender('one.pdf');
    await processedTender('two.pdf');
    await processedTender('three.pdf');
    const fourth = await processedTender('four.pdf');
    const ok = await analyse(first.id);
    assert.notEqual(ok.status, 409, 'not refused by the profile gate');
    const refused = await analyse(fourth.id);
    assert.equal(refused.status, 409);
    assert.equal(refused.json.code, 'profile_incomplete');
    assert.equal(await analysisStatus(fourth.id), 'NOT_STARTED');
  });

  await t.test("another company's tenders don't use up this company's free tenders", async () => {
    const other = await createCompanyWithOwner(db, { companyName: 'Other Co', userEmail: 'other@example.com', userName: 'O' });
    const otherScope = await requireCompanyAccess(db, { userId: other.user.id, companyId: other.company.id });
    await createTender(otherScope, { title: 'x.pdf' });
    await createTender(otherScope, { title: 'y.pdf' });
    await createTender(otherScope, { title: 'z.pdf' });
    assert.equal((await upload('mine.pdf')).status, 201);
  });

  await t.test('/me says the profile is incomplete, then complete', async () => {
    let me = await req('GET', '/bidpilot/me');
    assert.equal(me.json.companies[0].profileComplete, false);
    await completeProfile(company.id);
    me = await req('GET', '/bidpilot/me');
    assert.equal(me.json.companies[0].profileComplete, true);
  });

  await t.test('the profile API lists what is missing and accepts "None" for list fields only', async () => {
    let res = await req('GET', `/bidpilot/companies/${company.id}/profile`);
    assert.equal(res.json, null, 'no profile row yet');
    res = await req('PATCH', `/bidpilot/companies/${company.id}/profile`, { body: { industry: 'Civil' } });
    assert.equal(res.json.missing.length, 14, 'one of 15 answered');
    res = await req('PATCH', `/bidpilot/companies/${company.id}/profile`, { body: {
      industry: 'Civil', businessType: 'LLP', gstin: null, registrationDetails: 'Class B',
      yearsInBusiness: 3, annualTurnover: '1000000', netWorth: '500000', employeeCount: 5,
      geography: ['Gujarat'], certifications: [], licenses: [], equipment: [], oemRelationships: [],
      experience: [{ description: 'School building', value: '40 lakh', year: '2024', client: 'ZP' }],
      otherQualifications: '', noneFields: ['gstin', 'certifications', 'licenses', 'equipment', 'oemRelationships', 'otherQualifications', 'industry', 'bogus'],
    } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.missing, []);
    assert.ok(!res.json.noneFields.includes('industry') && !res.json.noneFields.includes('bogus'), 'only allowed keys are stored');
  });

  await t.test('once the profile is complete, a 4th upload and a 4th analysis are accepted', async () => {
    await processedTender('one.pdf');
    await processedTender('two.pdf');
    await processedTender('three.pdf');
    const fourth = await processedTender('four.pdf');
    assert.equal((await upload('d.pdf')).status, 409);
    await completeProfile(company.id);
    assert.equal((await upload('d.pdf')).status, 201);
    assert.notEqual((await analyse(fourth.id)).status, 409);
  });
});
