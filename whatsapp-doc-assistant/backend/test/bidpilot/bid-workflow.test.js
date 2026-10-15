// Bid tracker (stage, internal deadline, notes, portal link) and the
// submission checklist, over HTTP with a real database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import ExcelJS from 'exceljs';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence } from '../../src/bidpilot/repo/requirements.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';

// Sessions need the CSRF secret, as in the other HTTP tests.
const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('bid tracker and submission checklist (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let user; let auth; let scope; let tender;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
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
    const a = await createCompanyWithOwner(db, { companyName: 'Track Co', userEmail: 'track@example.com', userName: 'T' });
    company = a.company; user = a.user;
    const { rawToken, session } = await createSession(db, user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    tender = await createTender(scope, { title: 'road.pdf', tenderNumber: 'PWD/2026/7', organization: 'PWD' });
  });

  function req(method, path, body, { raw = false } = {}) {
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
          const buf = Buffer.concat(chunks);
          let json; try { json = JSON.parse(buf.toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, buf, headers: res.headers });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  const requirement = (category, title, description, page = 3, mandatory = true) => createRequirementWithEvidence(
    scope, tender.id, { category, title, description, mandatory }, [{ sourcePage: page, evidenceText: description }],
  );
  const cid = () => company.id;
  const checklist = () => req('GET', `/bidpilot/tenders/${tender.id}/checklist?companyId=${cid()}`);

  await t.test('stage, internal deadline and notes are saved; a stage change is recorded', async () => {
    const res = await req('PATCH', `/bidpilot/tenders/${tender.id}`, {
      companyId: cid(), status: 'PREPARING_BID', internalDeadline: '2026-10-20T12:00:00.000Z', notes: 'Ask client for CA certificate',
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'PREPARING_BID');
    assert.equal(new Date(res.json.internalDeadline).toISOString(), '2026-10-20T12:00:00.000Z');
    assert.equal(res.json.notes, 'Ask client for CA certificate');
    const ev = (await db.execute(`select event_type, metadata from tender_events where tender_id = '${tender.id}'`)).rows;
    assert.equal(ev.length, 1);
    assert.equal(ev[0].event_type, 'status_changed');
    assert.deepEqual(ev[0].metadata, { from: 'NEW', to: 'PREPARING_BID' });
    const cleared = await req('PATCH', `/bidpilot/tenders/${tender.id}`, { companyId: cid(), internalDeadline: null, notes: '' });
    assert.equal(cleared.json.internalDeadline, null);
    assert.equal(cleared.json.notes, null);
    assert.equal(cleared.json.status, 'PREPARING_BID', 'fields not sent are unchanged');
  });

  await t.test('bad input is refused', async () => {
    const p = (body) => req('PATCH', `/bidpilot/tenders/${tender.id}`, { companyId: cid(), ...body });
    assert.equal((await p({ status: 'WON_FOR_SURE' })).status, 400);
    assert.equal((await p({ internalDeadline: 'next week' })).status, 400);
    assert.equal((await p({ notes: 'x'.repeat(2001) })).status, 400);
    assert.equal((await p({ portalUrl: 'javascript:alert(1)' })).status, 400);
    assert.equal((await p({ clientId: '00000000-0000-0000-0000-000000000000' })).status, 400);
    assert.equal((await p({})).status, 400);
  });

  await t.test('the portal link and tender ID are saved', async () => {
    const res = await req('PATCH', `/bidpilot/tenders/${tender.id}`, {
      companyId: cid(), portalUrl: 'https://eprocure.gov.in/cppp/tendersfullview/abc', portalRef: '2026_PWD_123_1',
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.portalUrl, 'https://eprocure.gov.in/cppp/tendersfullview/abc');
    assert.equal(res.json.portalRef, '2026_PWD_123_1');
  });

  await t.test("another company's tender is not found", async () => {
    const other = await createCompanyWithOwner(db, { companyName: 'Other', userEmail: 'o@example.com', userName: 'O' });
    const otherScope = await requireCompanyAccess(db, { userId: other.user.id, companyId: other.company.id });
    const theirs = await createTender(otherScope, { title: 'x.pdf' });
    assert.equal((await req('PATCH', `/bidpilot/tenders/${theirs.id}`, { companyId: cid(), status: 'SUBMITTED' })).status, 404);
    assert.equal((await req('GET', `/bidpilot/tenders/${theirs.id}/checklist?companyId=${cid()}`)).status, 404);
    assert.equal((await req('GET', `/bidpilot/tenders/${tender.id}/checklist?companyId=${other.company.id}`)).status, 403);
  });

  await t.test('the checklist lists only what the analysis found, documents first, without duplicates', async () => {
    await requirement('FINANCIAL', 'Average turnover', 'Average annual turnover of Rs 50 lakh in the last 3 years', 4);
    await requirement('DOCUMENT', 'GST certificate', 'Copy of GST registration certificate', 6);
    await requirement('DOCUMENT', 'GST certificate', 'Copy of  GST registration   certificate', 7); // same condition again
    const res = await checklist();
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.items.map((i) => i.label), ['GST certificate', 'Average turnover']);
    assert.equal(res.json.items[0].sourcePage, 6);
    assert.equal(res.json.total, 2);
    assert.equal(res.json.done, 0);
  });

  await t.test('ticks are saved, can be undone, and an unknown item is refused', async () => {
    await requirement('DOCUMENT', 'PAN card', 'Copy of PAN card');
    const key = (await checklist()).json.items[0].key;
    let res = await req('PUT', `/bidpilot/tenders/${tender.id}/checklist/requirement`, { companyId: cid(), key, done: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.done, 1);
    assert.equal(res.json.items[0].done, true);
    res = await req('PUT', `/bidpilot/tenders/${tender.id}/checklist/requirement`, { companyId: cid(), key, done: false });
    assert.equal(res.json.done, 0);
    res = await req('PUT', `/bidpilot/tenders/${tender.id}/checklist/requirement`, { companyId: cid(), key: 'f'.repeat(40), done: true });
    assert.equal(res.status, 404);
  });

  await t.test('a re-analysis keeps ticks for the same requirement and drops removed ones', async () => {
    await requirement('DOCUMENT', 'PAN card', 'Copy of PAN card');
    await requirement('EXPERIENCE', 'Similar work', 'One similar work of Rs 40 lakh');
    for (const item of (await checklist()).json.items) {
      await req('PUT', `/bidpilot/tenders/${tender.id}/checklist/requirement`, { companyId: cid(), key: item.key, done: true });
    }
    // A new analysis replaces the requirements: the same PAN card condition,
    // a reworded experience condition.
    await db.execute(`delete from tender_requirements where tender_id = '${tender.id}'`);
    await requirement('DOCUMENT', 'PAN card', 'Copy of PAN card');
    await requirement('EXPERIENCE', 'Similar work', 'Two similar works of Rs 25 lakh each');
    const res = await checklist();
    const byLabel = Object.fromEntries(res.json.items.map((i) => [`${i.label}|${i.done}`, true]));
    assert.ok(byLabel['PAN card|true'], 'unchanged requirement keeps its tick');
    assert.ok(byLabel['Similar work|false'], 'changed requirement starts unticked');
    assert.equal(res.json.done, 1);
  });

  await t.test('items can be added, ticked and removed', async () => {
    let res = await req('POST', `/bidpilot/tenders/${tender.id}/checklist/custom`, { companyId: cid(), label: 'Courier the EMD DD' });
    assert.equal(res.status, 201);
    const id = res.json.custom[0].id;
    res = await req('PATCH', `/bidpilot/tenders/${tender.id}/checklist/custom/${id}`, { companyId: cid(), done: true });
    assert.equal(res.json.custom[0].done, true);
    assert.equal(res.json.done, 1);
    assert.equal((await req('POST', `/bidpilot/tenders/${tender.id}/checklist/custom`, { companyId: cid(), label: '  ' })).status, 400);
    assert.equal((await req('PATCH', `/bidpilot/tenders/${tender.id}/checklist/custom/not-a-uuid`, { companyId: cid(), done: true })).status, 404);
    res = await req('DELETE', `/bidpilot/tenders/${tender.id}/checklist/custom/${id}`, { companyId: cid() });
    assert.equal(res.status, 200);
    assert.equal(res.json.custom.length, 0);
  });

  await t.test('the Excel download has the tender and every checklist line', async () => {
    await requirement('DOCUMENT', 'GST certificate', 'Copy of GST registration certificate', 6);
    await req('POST', `/bidpilot/tenders/${tender.id}/checklist/custom`, { companyId: cid(), label: 'Courier the EMD DD' });
    const res = await req('GET', `/bidpilot/tenders/${tender.id}/checklist.xlsx?companyId=${cid()}`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /road-checklist\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.buf);
    const text = [];
    wb.getWorksheet('Checklist').eachRow((row) => text.push(row.values.filter(Boolean).join(' | ')));
    const all = text.join('\n');
    assert.match(all, /Tender \| road\.pdf/);
    assert.match(all, /PWD\/2026\/7/);
    assert.match(all, /GST certificate: Copy of GST registration certificate \| Document \| Yes \| 6/);
    assert.match(all, /Courier the EMD DD \| Added by you/);
    assert.match(all, /Ready \| 0 of 2/);
  });
});
