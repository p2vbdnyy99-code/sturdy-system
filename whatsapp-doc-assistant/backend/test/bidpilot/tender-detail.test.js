// Milestone 5a — GET /bidpilot/tenders/:id, rewritten from a summary-only
// response into the unified tender-intelligence read: overview (merged with
// its per-field evidence), requirements+evidence, BOQ, dates, red flags,
// document, activity — one logical read for the whole detail page, per the
// M5 audit's "product-level representation, not database-shaped endpoints"
// decision. The AI provider is always mocked — no real API call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, updateProcessingStatus } from '../../src/bidpilot/repo/tenders.js';
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { createTenderDocument } from '../../src/bidpilot/repo/documents.js';
import { setProvider } from '../../src/ai/index.js';
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

function mockValidResult({ submissionDeadline } = {}) {
  return JSON.stringify({
    overview: {
      organization: { value: 'Acme Infra', sourcePage: 1, evidenceText: 'Acme Infra Pvt Ltd' },
      // Free-text money values, not clean numbers — this is exactly the shape
      // that used to throw a Postgres "invalid input syntax for type numeric"
      // and fail the whole analysis (estimatedValue/emd/tenderFee were fixed
      // from numeric to text columns alongside this test — see
      // BIDPILOT_ARCHITECTURE.md).
      estimatedValue: { value: 'Rs 5 crore', sourcePage: 2, evidenceText: 'estimated value Rs 5 crore' },
      emd: { value: 'Rs 5 crore or equivalent in USD', sourcePage: 2, evidenceText: 'EMD: Rs 5 crore or equivalent in USD' },
      ...(submissionDeadline ? { submissionDeadline } : {}),
      // location deliberately omitted — must come back null, not a placeholder.
    },
    requirements: [{
      category: 'FINANCIAL', title: 'Turnover', description: 'Min turnover Rs 5 crore',
      mandatory: true, sourcePage: 1, evidenceText: 'quoted evidence', extractedValue: 'Rs 5 crore', confidence: 0.9,
    }],
    boq: [{ description: 'Cement bags', quantity: '500', unit: 'bags', sourcePage: 1 }],
    dates: [{ label: 'Pre-bid meeting', rawText: '12 Oct 2026', sourcePage: 1, evidenceText: 'q' }],
    redFlags: [{ description: 'One-sided termination clause', sourcePage: 1, evidenceText: 'q' }],
  });
}

test('GET /tenders/:id (HTTP integration)', { skip: SKIP_REASON, timeout: 30_000 }, async (t) => {
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
    const a = await createCompanyWithOwner(db, { companyName: 'Detail Co A', userEmail: 'a@detail.example', userName: 'A' });
    userA = a.user; companyA = a.company;
    authA = await mintAuth(userA.id);
  });

  function req(method, path, { body, auth } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...(auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {}),
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

  async function waitForAnalysis(tenderId, maxMs = 10_000) {
    const start = Date.now();
    for (;;) {
      const { json } = await req('GET', `/bidpilot/tenders/${tenderId}?companyId=${companyA.id}`, { auth: authA });
      if (json.analysisStatus === 'COMPLETED' || json.analysisStatus === 'FAILED') return json;
      if (Date.now() - start > maxMs) throw new Error(`Timed out, last: ${json.analysisStatus}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  await t.test('not found for a nonexistent tender id', async () => {
    const res = await req('GET', `/bidpilot/tenders/00000000-0000-0000-0000-000000000000?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 404);
  });

  await t.test('a caller cannot read another company\'s tender (404, not 403 — never confirms the id exists)', async () => {
    const b = await createCompanyWithOwner(db, { companyName: 'Detail Co B', userEmail: 'b@detail.example', userName: 'B' });
    const scopeB = await requireCompanyAccess(db, { userId: b.user.id, companyId: b.company.id });
    const tender = await createTender(scopeB, { title: 'Company B\'s tender' });

    const res = await req('GET', `/bidpilot/tenders/${tender.id}?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 404);
  });

  await t.test('a freshly-uploaded, unanalyzed tender: empty arrays and null overview fields, not missing keys or errors', async () => {
    const scopeA = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await createTender(scopeA, { title: 'Fresh Tender' });
    await insertPages(scopeA, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }]);

    const res = await req('GET', `/bidpilot/tenders/${tender.id}?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 200);
    assert.equal(res.json.pageCount, 1);
    assert.equal(res.json.analysisStatus, 'NOT_STARTED');
    assert.deepEqual(res.json.requirements, []);
    assert.deepEqual(res.json.boq, []);
    assert.deepEqual(res.json.dates, []);
    assert.deepEqual(res.json.redFlags, []);
    assert.deepEqual(res.json.activity, []);
    assert.equal(res.json.document, null);
    for (const field of ['organization', 'tenderNumber', 'location', 'estimatedValue', 'emd', 'tenderFee', 'contractDuration', 'submissionDeadline', 'openingDate']) {
      assert.equal(res.json.overview[field], null, `overview.${field} should be null, not a placeholder object`);
    }
  });

  await t.test('after a completed analysis: overview merges value + evidence, requirements carry evidence, activity is populated', async () => {
    const scopeA = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await createTender(scopeA, { title: 'Analyzed Tender' });
    await insertPages(scopeA, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }, { pageNumber: 2, rawText: 'more', ocrUsed: false }]);
    await updateProcessingStatus(scopeA, tender.id, 'COMPLETED');
    await createTenderDocument(scopeA, tender.id, {
      filename: 'tender.pdf', storagePath: 'k1', mimeType: 'application/pdf', sizeBytes: 1234,
    });
    setProvider({ name: 'mock', async complete() { return mockValidResult(); } });

    const analyzeRes = await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(analyzeRes.status, 202);
    const final = await waitForAnalysis(tender.id);
    assert.equal(final.analysisStatus, 'COMPLETED');

    // organization: value present with real evidence.
    assert.deepEqual(final.overview.organization, {
      value: 'Acme Infra', sourcePage: 1, evidenceText: 'Acme Infra Pvt Ltd',
    });
    // location: never provided by the mock AI response — must be null, not
    // an empty-string placeholder or a fabricated citation.
    assert.equal(final.overview.location, null);

    // The bug this test was written to catch: a free-text money value in a
    // formerly-numeric column no longer throws and fails the whole analysis.
    assert.equal(final.overview.estimatedValue.value, 'Rs 5 crore');
    assert.equal(final.overview.emd.value, 'Rs 5 crore or equivalent in USD');

    assert.equal(final.requirements.length, 1);
    assert.equal(final.requirements[0].category, 'FINANCIAL');
    assert.equal(final.requirements[0].evidence.length, 1);
    assert.equal(final.requirements[0].evidence[0].sourcePage, 1);
    assert.equal(final.requirements[0].evidence[0].evidenceText, 'quoted evidence');

    assert.equal(final.boq.length, 1);
    assert.equal(final.boq[0].description, 'Cement bags');
    assert.equal(final.dates.length, 1);
    assert.equal(final.redFlags.length, 1);

    assert.equal(final.document.filename, 'tender.pdf');
    assert.equal(final.document.mimeType, 'application/pdf');
    assert.equal(final.document.sizeBytes, 1234);
    assert.ok(final.document.uploadedAt);

    assert.ok(final.activity.length >= 1);
    assert.equal(final.activity[0].eventType, 'analysis_completed');
  });

  await t.test('overview submissionDeadline: a calendar-parseable AI value lands in the typed column', async () => {
    const scopeA = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await createTender(scopeA, { title: 'Parseable Deadline Tender' });
    await insertPages(scopeA, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }]);
    await updateProcessingStatus(scopeA, tender.id, 'COMPLETED');
    setProvider({
      name: 'mock',
      async complete() {
        return mockValidResult({
          submissionDeadline: { value: '2026-11-15', sourcePage: 1, evidenceText: 'Last date: 15 Nov 2026' },
        });
      },
    });

    await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    const final = await waitForAnalysis(tender.id);
    assert.equal(final.analysisStatus, 'COMPLETED');
    assert.equal(new Date(final.overview.submissionDeadline.value).toISOString().slice(0, 10), '2026-11-15');
  });

  await t.test('overview submissionDeadline: an honest but non-calendar AI value is preserved as text, never dropped or fabricated into a date', async () => {
    const scopeA = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await createTender(scopeA, { title: 'Unparseable Deadline Tender' });
    await insertPages(scopeA, tender.id, [{ pageNumber: 1, rawText: 'text', ocrUsed: false }]);
    await updateProcessingStatus(scopeA, tender.id, 'COMPLETED');
    setProvider({
      name: 'mock',
      async complete() {
        return mockValidResult({
          submissionDeadline: { value: 'within 30 days of tender opening', sourcePage: 1, evidenceText: 'submission within 30 days of opening' },
        });
      },
    });

    await req('POST', `/bidpilot/tenders/${tender.id}/analyze`, { auth: authA, body: { companyId: companyA.id } });
    const final = await waitForAnalysis(tender.id);
    assert.equal(final.analysisStatus, 'COMPLETED', 'a non-parseable date must never fail the whole analysis');
    assert.equal(final.overview.submissionDeadline.value, 'within 30 days of tender opening');
    assert.equal(final.overview.submissionDeadline.evidenceText, 'submission within 30 days of opening');
  });
});
