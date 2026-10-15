// The corrigendum check: the strict validator (unit), and upload → check →
// apply over HTTP with a real PDF, a real database and a stand-in AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import { buildPdf } from '../fixtures.mjs';
import { validateCorrigendumResult } from '../../src/bidpilot/analysis/corrigendum.js';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setProvider } from '../../src/ai/index.js';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';

const pages = [
  { pageNumber: 1, rawText: 'CORRIGENDUM No. 1\nThe last date of bid submission is extended to 05/11/2026 at 15:00 hrs.' },
  { pageNumber: 2, rawText: 'The EMD is revised to Rs. 1,50,000/-. All other terms remain unchanged.' },
];
const facts = { submissionDeadline: '20 Oct 2026, 3:00 pm', emd: 'Rs. 1,27,300/-' };

test('validator: keeps changes whose quote is on the named page', () => {
  const r = validateCorrigendumResult({
    summary: 'Deadline extended and EMD revised.',
    changes: [
      { field: 'submissionDeadline', label: 'Bid submission end date', after: '05/11/2026 15:00', sourcePage: '1',
        evidenceText: 'The last date of bid submission is extended to 05/11/2026 at 15:00 hrs.' },
      { field: 'emd', after: 'Rs. 1,50,000/-', sourcePage: 2, evidenceText: 'The EMD is revised to   Rs. 1,50,000/-.', before: 'AI made this up' },
    ],
  }, { pages, facts });
  assert.equal(r.changes.length, 2);
  assert.equal(r.changes[0].sourcePage, 1, 'page given as a string is coerced');
  assert.equal(r.changes[0].before, '20 Oct 2026, 3:00 pm', '"before" comes from the tender, not the AI');
  assert.equal(r.changes[1].before, 'Rs. 1,27,300/-');
  assert.equal(r.changes[1].label, 'EMD', 'a missing label falls back to the field name');
  assert.equal(r.summary, 'Deadline extended and EMD revised.');
});

test('validator: drops invented quotes, wrong pages, unknown fields and empty values', () => {
  const r = validateCorrigendumResult({
    changes: [
      { field: 'emd', after: 'Rs. 2,00,000/-', sourcePage: 2, evidenceText: 'The EMD is revised to Rs. 2,00,000/-.' }, // not in the text
      { field: 'emd', after: 'Rs. 1,50,000/-', sourcePage: 1, evidenceText: 'The EMD is revised to Rs. 1,50,000/-.' }, // wrong page
      { field: 'bidVerdict', after: 'Bid', sourcePage: 1, evidenceText: 'CORRIGENDUM No. 1' }, // unknown field
      { field: 'emd', after: '', sourcePage: 2, evidenceText: 'The EMD is revised' }, // no value
      { field: 'emd', after: 'x', sourcePage: 9, evidenceText: 'anything' }, // page that doesn't exist
      'not an object',
    ],
  }, { pages, facts });
  assert.equal(r.changes.length, 0);
  assert.equal(r.dropped, 6);
  assert.equal(validateCorrigendumResult(null, { pages, facts }).changes.length, 0);
});

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('corrigendum upload, check and apply (HTTP)', { skip: SKIP_REASON, timeout: 60_000 }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let auth; let scope; let tender; let aiCalls = 0;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'corr-'));
    setStorage(new LocalDiskStorage({ dir, publicBaseUrl: 'http://localhost', signingSecret: 'corr-test-secret' }));
    setProvider({
      name: 'mock',
      async complete({ user }) {
        aiCalls += 1;
        assert.match(user, /EMD: Rs\. 1,27,300\/-/, 'the tender\'s current facts are sent');
        return JSON.stringify({
          summary: 'Bid deadline extended to 5 November; EMD revised.',
          changes: [
            { field: 'submissionDeadline', label: 'Bid submission end date', after: '05/11/2026 at 15:00 hrs', sourcePage: 1,
              evidenceText: 'The last date of bid submission is extended to 05/11/2026 at 15:00 hrs.' },
            { field: 'emd', label: 'EMD', after: 'Rs. 1,50,000/-', sourcePage: 1, evidenceText: 'The EMD is revised to Rs. 1,50,000/-.' },
            { field: 'condition', label: 'Turnover', after: 'Rs 80 lakh', sourcePage: 1, evidenceText: 'Turnover must be Rs 80 lakh.' },
          ],
        });
      },
    });
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
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
    const a = await createCompanyWithOwner(db, { companyName: 'Corr Co', userEmail: 'corr@example.com', userName: 'C' });
    company = a.company;
    const { rawToken, session } = await createSession(db, a.user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: a.user.id, companyId: company.id });
    tender = await createTender(scope, {
      title: 'iith.pdf', emd: 'Rs. 1,27,300/-', submissionDeadline: new Date('2026-10-20T09:30:00Z'),
      overviewEvidence: { emd: { sourcePage: 2, evidenceText: 'EMD Rs. 1,27,300/-' } },
    });
    aiCalls = 0;
  });

  function send(method, p, { body, raw, contentType } = {}) {
    return new Promise((resolve, reject) => {
      const payload = raw ?? (body ? Buffer.from(JSON.stringify(body)) : null);
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf,
        ...(payload ? { 'content-type': contentType ?? 'application/json', 'content-length': String(payload.length) } : {}),
      };
      const r = http.request(`${baseUrl}${p}`, { method, headers }, (res) => {
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

  async function uploadCorrigendum(pdf) {
    const boundary = '----corr' + Math.random().toString(16).slice(2);
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="corrigendum-1.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return send('POST', `/bidpilot/tenders/${tender.id}/corrigenda`, { raw, contentType: `multipart/form-data; boundary=${boundary}` });
  }

  async function waitDone() {
    for (let i = 0; i < 100; i += 1) {
      const res = await send('GET', `/bidpilot/tenders/${tender.id}/corrigenda?companyId=${company.id}`);
      const c = res.json.corrigenda[0];
      if (c && c.status !== 'PROCESSING') return c;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('corrigendum never finished');
  }

  const pdf = () => buildPdf((doc) => {
    doc.font('Helvetica').fontSize(12)
      .text('CORRIGENDUM No. 1')
      .text('The last date of bid submission is extended to 05/11/2026 at 15:00 hrs.')
      .text('The EMD is revised to Rs. 1,50,000/-.');
  });

  await t.test('the check lists only changes quoted from the corrigendum', async () => {
    const up = await uploadCorrigendum(await pdf());
    assert.equal(up.status, 201);
    const c = await waitDone();
    assert.equal(c.status, 'COMPLETED', c.error ?? '');
    assert.equal(aiCalls, 1);
    assert.deepEqual(c.changes.map((x) => x.field), ['submissionDeadline', 'emd'], 'the invented turnover change is dropped');
    assert.equal(c.changes[1].before, 'Rs. 1,27,300/-');
    const usage = (await db.execute(`select count(*)::int n from usage_records where company_id = '${company.id}'`)).rows[0].n;
    assert.equal(usage, 1, 'the AI call counts against the daily cap');
  });

  await t.test('applying changes updates the tender and records it', async () => {
    await uploadCorrigendum(await pdf());
    const c = await waitDone();
    const res = await send('POST', `/bidpilot/tenders/${tender.id}/corrigenda/${c.id}/apply`, {
      body: { companyId: company.id, fields: ['submissionDeadline', 'emd', 'bidVerdict'] },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.applied.sort(), ['emd', 'submissionDeadline']);
    const row = (await db.execute(`select emd, submission_deadline, overview_evidence from tenders where id = '${tender.id}'`)).rows[0];
    assert.equal(row.emd, 'Rs. 1,50,000/-');
    assert.equal(new Date(row.submission_deadline).toISOString(), '2026-11-05T09:30:00.000Z', 'day/month/year, IST');
    assert.match(row.overview_evidence.emd.evidenceText, /From the corrigendum corrigendum-1\.pdf, page 1/);
    const ev = (await db.execute(`select event_type from tender_events where tender_id = '${tender.id}'`)).rows;
    assert.deepEqual(ev.map((e) => e.event_type), ['corrigendum_applied']);
    const again = await send('GET', `/bidpilot/tenders/${tender.id}/corrigenda?companyId=${company.id}`);
    assert.ok(again.json.corrigenda[0].appliedAt);
  });

  await t.test('nothing to apply, and a non-PDF, are refused', async () => {
    await uploadCorrigendum(await pdf());
    const c = await waitDone();
    const none = await send('POST', `/bidpilot/tenders/${tender.id}/corrigenda/${c.id}/apply`, { body: { companyId: company.id, fields: [] } });
    assert.equal(none.status, 400);
    const bad = await uploadCorrigendum(Buffer.from('not a pdf'));
    assert.equal(bad.status, 400);
  });
});
