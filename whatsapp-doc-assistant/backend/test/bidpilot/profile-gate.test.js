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
import { createTender, updateProcessingStatus } from '../../src/bidpilot/repo/tenders.js';
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

test('mandatory company profile (HTTP)', { skip: SKIP_REASON }, async (t) => {
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

  function upload() {
    const boundary = '----gate' + Math.random().toString(16).slice(2);
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from('%PDF-1.4\n%%EOF\n'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return req('POST', '/bidpilot/tenders/upload', { raw, contentType: `multipart/form-data; boundary=${boundary}` });
  }

  await t.test('upload is refused with 409 profile_incomplete and the missing fields', async () => {
    const res = await upload();
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'profile_incomplete');
    assert.ok(res.json.missing.includes('annualTurnover'));
  });

  await t.test('analyse is refused too, and nothing starts', async () => {
    const scope = await requireCompanyAccess(db, { userId: (await db.execute('select id from users limit 1')).rows[0].id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x.pdf' });
    await insertPages(scope, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }]);
    await updateProcessingStatus(scope, tender.id, 'COMPLETED');
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { body: { companyId: company.id } });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'profile_incomplete');
    const status = (await db.execute(`select analysis_status from tenders where id = '${tender.id}'`)).rows[0].analysis_status;
    assert.equal(status, 'NOT_STARTED');
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

  await t.test('once complete, upload is accepted', async () => {
    await completeProfile(company.id);
    const res = await upload();
    assert.equal(res.status, 201);
  });
});
