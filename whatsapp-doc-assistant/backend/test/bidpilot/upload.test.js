// The full vertical slice, over real HTTP, real Postgres, and real extraction:
//   PDF upload -> secure validation -> durable Tender -> page-aware extraction
//   -> tender_pages -> durable processing status -> completion/failure
//
// This spins up the ACTUAL bidpilot routers (the same ones server.js mounts),
// on an ephemeral port, so requests go through real Express middleware,
// multer parsing, and HTTP status codes — not mocked handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import {
  formattingPdf, ruledTablePdf, toScannedPdf, buildPdf,
} from '../fixtures.mjs';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createDownloadRouter } from '../../src/bidpilot/routes/download.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';

// Milestone 2's routes are now gated by Milestone 3's real session auth (the
// earlier placeholder x-bidpilot-user-id header no longer exists at all).
// Sessions here are minted DIRECTLY via createSession() rather than going
// through the real POST /login HTTP flow — this file is testing tender
// ingestion, not login; the login/registration flow itself has its own
// dedicated, thorough coverage in test/bidpilot/auth.test.js. Using the fast
// path here keeps these 17 tests focused and quick.
//
// Needs BIDPILOT_CSRF_SECRET too, not just DATABASE_URL — uploadPdf()'s CSRF
// header is derived via csrfTokenFor(), which reads it from config.
const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

test('BidPilot tender ingestion (full vertical slice)', {
  skip: SKIP_REASON,
  timeout: 60_000,
}, async (t) => {
  // Two separate pg.Pools to the SAME database: `db` is this test file's own
  // pool for direct verification queries; the app code under test
  // (routes/auth.js, routes/tenders.js) uses whatever setDb() below points
  // getDb() at. Both see the same committed rows — that's just Postgres, not
  // a shared-state shortcut.
  const db = testDb();

  // Storage: real LocalDiskStorage against a temp dir — no mocking, this is
  // the backend that will actually run in this milestone's dev/beta use.
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bidpilot-upload-test-'));
  const storage = new LocalDiskStorage({
    dir: storageDir,
    publicBaseUrl: 'http://placeholder', // overwritten per-request below via app mount
    signingSecret: 'integration-test-signing-secret',
  });

  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);

    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createTendersRouter());
    app.use('/bidpilot', createDownloadRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    storage.publicBaseUrl = baseUrl;
    setStorage(storage);
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(storageDir, { recursive: true, force: true });
    setStorage(null);
    await closeDb();
    await closeTestDb();
  });

  let userA, companyA, userB, companyB, authA, authB;

  /** Mint a real session (bypassing the login HTTP flow — see file header)
   *  and the matching CSRF token for a test user. */
  async function mintAuth(userId) {
    const { rawToken, session } = await createSession(db, userId);
    return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  }

  t.beforeEach(async () => {
    // Grace period for the PREVIOUS test's fire-and-forget background
    // extraction (setImmediate in routes/tenders.js) to settle before this
    // test's truncate — a test that doesn't itself call waitForTerminalStatus
    // would otherwise leave a dangling job that errors harmlessly against
    // already-truncated tables (noisy logs, not a real correctness issue,
    // since FK constraints mean it can't corrupt anything — but worth not
    // racing anyway).
    await new Promise((r) => setTimeout(r, 250));
    await truncateAll();
    const a = await createCompanyWithOwner(db, {
      companyName: 'Ingestion Test Co A', userEmail: 'a@ingest.example', userName: 'A',
    });
    const b = await createCompanyWithOwner(db, {
      companyName: 'Ingestion Test Co B', userEmail: 'b@ingest.example', userName: 'B',
    });
    userA = a.user; companyA = a.company;
    userB = b.user; companyB = b.company;
    authA = await mintAuth(userA.id);
    authB = await mintAuth(userB.id);
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Map a `user` param (userA / userB / null, the only values this file
   *  ever passes) to the matching minted {cookie, csrf} pair, or undefined
   *  for null (the "no session at all" case). */
  function authFor(user) {
    if (user === userA) return authA;
    if (user === userB) return authB;
    return undefined; // user === null, or an explicitly-unauthenticated call
  }

  function authHeaders(user, { includeCsrf } = {}) {
    const auth = authFor(user);
    if (!auth) return {};
    return {
      cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`,
      ...(includeCsrf ? { 'x-csrf-token': auth.csrf } : {}),
    };
  }

  function uploadPdf({ user = userA, company = companyA, buffer, filename = 'tender.pdf', headers = {} } = {}) {
    const boundary = '----bidpilottest' + Math.random().toString(16).slice(2);
    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`,
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
    ));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    return httpRequest('POST', '/bidpilot/tenders/upload', {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
      ...authHeaders(user, { includeCsrf: true }), // upload is state-changing -> CSRF required
      ...headers,
    }, body);
  }

  function getTenderStatus(tenderId, { user = userA, company = companyA } = {}) {
    return httpRequest('GET', `/bidpilot/tenders/${tenderId}?companyId=${company.id}`, authHeaders(user));
  }

  function getDocumentUrl(tenderId, { user = userA, company = companyA } = {}) {
    return httpRequest('GET', `/bidpilot/tenders/${tenderId}/document-url?companyId=${company.id}`, authHeaders(user));
  }

  function httpRequest(method, urlPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${urlPath}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json;
          try { json = JSON.parse(raw.toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, buffer: raw });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async function waitForTerminalStatus(tenderId, opts, maxMs = 20_000) {
    const start = Date.now();
    for (;;) {
      const { json } = await getTenderStatus(tenderId, opts);
      if (json.processingStatus === 'COMPLETED' || json.processingStatus === 'FAILED') return json;
      if (Date.now() - start > maxMs) throw new Error(`Timed out waiting for terminal status, last: ${json.processingStatus}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ── 1-6: the golden path ────────────────────────────────────────────────

  await t.test('1-2. authenticated company can upload a valid PDF; Tender is created with correct company ownership', async () => {
    const buffer = await formattingPdf();
    const res = await uploadPdf({ buffer });
    assert.equal(res.status, 201);
    assert.equal(res.json.status, 'NEW');
    assert.equal(res.json.processingStatus, 'UPLOADED');
    assert.equal(res.json.duplicate, false);

    // Company ownership: company B must NOT be able to see it (proven
    // properly in the tenant-isolation block below); here just confirm A can.
    const status = await getTenderStatus(res.json.tenderId);
    assert.equal(status.status, 200);
  });

  await t.test('3. TenderDocument is created correctly (filename, size, hash, storage key)', async () => {
    const buffer = await formattingPdf();
    const res = await uploadPdf({ buffer, filename: 'Highway Tender.pdf' });
    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listDocumentsForTender } = await import('../../src/bidpilot/repo/documents.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const [doc] = await listDocumentsForTender(scope, res.json.tenderId);
    assert.equal(doc.filename, 'Highway Tender.pdf');
    assert.equal(doc.sizeBytes, buffer.length);
    assert.match(doc.storagePath, /^[0-9a-f-]{36}\.pdf$/, 'storage key is a generated uuid, not the filename');
    assert.match(doc.contentHash, /^[0-9a-f]{64}$/, 'sha256 hex digest');
  });

  await t.test('4-5-6. processing status transitions to COMPLETED and pages are persisted with correct numbers', async () => {
    // NOT twoPagePdf() — its per-page text is short enough (~40 chars) to sit
    // right at SCANNED_CHARS_PER_PAGE's default threshold and legitimately
    // trigger OCR (correct existing Papyr behavior, see test/ocr.test.js) —
    // which would make this test's "never uses OCR" assertion fragile. This
    // fixture has enough real text per page to unambiguously stay digital.
    const buffer = await buildPdf((doc) => {
      doc.font('Helvetica-Bold').fontSize(18).text('Page One Title');
      doc.font('Helvetica').fontSize(12).text(
        'Substantial body text for page one, well above the scanned-page character threshold. '.repeat(4),
      );
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(18).text('Page Two Title');
      doc.font('Helvetica').fontSize(12).text(
        'Substantial body text for page two, well above the scanned-page character threshold. '.repeat(4),
      );
    });
    const res = await uploadPdf({ buffer });
    const final = await waitForTerminalStatus(res.json.tenderId);
    assert.equal(final.processingStatus, 'COMPLETED');
    assert.equal(final.pageCount, 2);

    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listPages } = await import('../../src/bidpilot/repo/pages.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const pages = await listPages(scope, res.json.tenderId);
    const numbers = pages.map((p) => p.pageNumber).sort((a, b) => a - b);
    assert.deepEqual(numbers, [1, 2]);
    assert.ok(pages.every((p) => typeof p.rawText === 'string' && p.rawText.length > 0), 'every page has real extracted text');
    assert.ok(pages.every((p) => p.ocrUsed === false), 'a digital PDF never uses OCR');
  });

  // ── 7: OCR fallback ─────────────────────────────────────────────────────

  await t.test('7. OCR fallback works using a genuinely scanned fixture', async () => {
    const digital = await ruledTablePdf();
    const scanned = await toScannedPdf(digital, { dpi: 120 });
    const res = await uploadPdf({ buffer: scanned });
    const final = await waitForTerminalStatus(res.json.tenderId, {}, 40_000);
    assert.equal(final.processingStatus, 'COMPLETED');
    assert.ok(final.pageCount >= 1);

    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listPages } = await import('../../src/bidpilot/repo/pages.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const pages = await listPages(scope, res.json.tenderId);
    assert.ok(pages.some((p) => p.ocrUsed === true), 'at least one page went through OCR');
  });

  // ── 8-9: safe rejection ─────────────────────────────────────────────────

  await t.test('8. a malformed file fails safely (400, no tender created)', async () => {
    const res = await uploadPdf({ buffer: Buffer.from('this is definitely not a pdf') });
    assert.equal(res.status, 400);
    assert.ok(res.json.error);
    assert.doesNotMatch(JSON.stringify(res.json), /at Object|node_modules|\.js:\d+:\d+/, 'no stack trace leaked');
  });

  await t.test('9. an oversized file is rejected', async () => {
    const { config } = await import('../../src/config.js');
    const big = Buffer.alloc(config.bidpilot.maxUploadBytes + 1024);
    Buffer.from('%PDF-1.4').copy(big, 0);
    const res = await uploadPdf({ buffer: big });
    assert.ok(res.status === 400 || res.status === 413, `expected a rejection, got ${res.status}`);
  });

  // ── 10: tenant isolation over real HTTP ─────────────────────────────────

  await t.test('10. Company A cannot access Company B\'s tender via the API', async () => {
    const buffer = await formattingPdf();
    const res = await uploadPdf({ user: userB, company: companyB, buffer });
    // userA legitimately queries THEIR OWN company (companyA — requireCompanyAccess
    // succeeds), but names a tender that actually belongs to companyB. Per the
    // deliberate design from Milestone 1 (repo/tenants.js), a cross-tenant
    // lookup returns 404 — identical to "not found" — never a distinguishable
    // 403, which would leak that the id is valid. See "10b" below for the
    // 403 case: a user naming a companyId they aren't even a member of.
    const asA = await getTenderStatus(res.json.tenderId, { user: userA, company: companyA });
    assert.equal(asA.status, 404);
  });

  await t.test('10b. a user cannot upload into a company they do not belong to', async () => {
    const buffer = await formattingPdf();
    // userA authenticated, but naming companyB.
    const res = await uploadPdf({ user: userA, company: companyB, buffer });
    assert.equal(res.status, 403);
  });

  await t.test('guessed tender id returns 404, not a distinguishable error', async () => {
    const res = await getTenderStatus('00000000-0000-0000-0000-000000000000');
    assert.equal(res.status, 404);
  });

  await t.test('no identity header is rejected (401) on every route', async () => {
    const buffer = await formattingPdf();
    const upload = await uploadPdf({ user: null, buffer });
    assert.equal(upload.status, 401);
    const status = await getTenderStatus('00000000-0000-0000-0000-000000000000', { user: null });
    assert.equal(status.status, 401);
  });

  // ── 11: duplicate handling ───────────────────────────────────────────────

  await t.test('11. duplicate upload behavior is deterministic (idempotent, no double-processing)', async () => {
    const buffer = await formattingPdf();
    const first = await uploadPdf({ buffer });
    await waitForTerminalStatus(first.json.tenderId);

    const second = await uploadPdf({ buffer });
    assert.equal(second.status, 200, 'a duplicate is 200, not 201 (nothing new was created)');
    assert.equal(second.json.tenderId, first.json.tenderId);
    assert.equal(second.json.duplicate, true);

    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listPages } = await import('../../src/bidpilot/repo/pages.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const pages = await listPages(scope, first.json.tenderId);
    assert.equal(pages.length, 1, 'pages were not re-inserted for the duplicate');
  });

  await t.test('11b. concurrent identical uploads race-safely resolve to ONE tender', async () => {
    const buffer = await formattingPdf();
    const [r1, r2, r3] = await Promise.all([uploadPdf({ buffer }), uploadPdf({ buffer }), uploadPdf({ buffer })]);
    const ids = new Set([r1.json.tenderId, r2.json.tenderId, r3.json.tenderId]);
    assert.equal(ids.size, 1, `expected exactly one tender across 3 concurrent identical uploads, got ${ids.size}`);
    const created = [r1, r2, r3].filter((r) => r.status === 201);
    assert.equal(created.length, 1, 'exactly one request created it; the others saw it as a duplicate');
  });

  await t.test('a DIFFERENT file from the same company is NOT treated as a duplicate', async () => {
    const a = await uploadPdf({ buffer: await formattingPdf() });
    const b = await uploadPdf({ buffer: await ruledTablePdf() });
    assert.notEqual(a.json.tenderId, b.json.tenderId);
    assert.equal(b.json.duplicate, false);
  });

  await t.test('the SAME file content from a DIFFERENT company is its own tender, not a cross-company duplicate', async () => {
    const buffer = await formattingPdf();
    const a = await uploadPdf({ user: userA, company: companyA, buffer });
    const b = await uploadPdf({ user: userB, company: companyB, buffer });
    assert.notEqual(a.json.tenderId, b.json.tenderId);
    assert.equal(b.json.duplicate, false);
  });

  // ── path traversal / safe filenames ──────────────────────────────────────

  await t.test('a path-traversal filename never affects the storage key or leaves the storage dir', async () => {
    const buffer = await formattingPdf();
    const res = await uploadPdf({ buffer, filename: '../../../../etc/passwd' });
    assert.equal(res.status, 201);

    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listDocumentsForTender } = await import('../../src/bidpilot/repo/documents.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const [doc] = await listDocumentsForTender(scope, res.json.tenderId);
    assert.doesNotMatch(doc.storagePath, /\.\.|\/etc\//, 'storage key never contains the traversal segments');

    const entries = await fs.readdir(storageDir);
    assert.ok(entries.every((e) => /^[0-9a-f-]{36}\.pdf$/.test(e)), 'every file on disk is a plain generated key');
  });

  // ── the signed-URL round trip ─────────────────────────────────────────────

  await t.test('the signed document URL round-trips the exact original bytes and rejects tampering', async () => {
    const buffer = await formattingPdf();
    const res = await uploadPdf({ buffer, filename: 'roundtrip.pdf' });
    const urlRes = await getDocumentUrl(res.json.tenderId);
    assert.equal(urlRes.status, 200);

    const parsed = new URL(urlRes.json.url);
    const good = await httpRequest('GET', parsed.pathname + parsed.search);
    assert.equal(good.status, 200);
    assert.ok(good.buffer.equals(buffer), 'downloaded bytes match the upload exactly');

    const tampered = await httpRequest('GET', parsed.pathname + parsed.search + 'TAMPERED');
    assert.equal(tampered.status, 403);

    // The signed URL needs NO identity header at all — it is self-authorizing.
    assert.ok(!parsed.search.includes('x-bidpilot-user-id'));
  });

  // ── 5 (large document): a realistic large synthetic PDF ────────────────

  await t.test('large-document handling: a synthetic ~40 page PDF processes completely via the isolated/page-aware pipeline', async () => {
    const PAGE_COUNT = 40;
    const buffer = await buildPdf((doc) => {
      for (let i = 1; i <= PAGE_COUNT; i++) {
        if (i > 1) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(16).text(`Section ${i}: Tender Clause`);
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(11).text(
          `This is synthetic clause text for page ${i} of a large tender document, `.repeat(20),
        );
      }
    });

    const start = Date.now();
    const res = await uploadPdf({ buffer, filename: 'large-tender.pdf' });
    assert.equal(res.status, 201);
    const final = await waitForTerminalStatus(res.json.tenderId, {}, 45_000);
    assert.equal(final.processingStatus, 'COMPLETED');
    assert.equal(final.pageCount, PAGE_COUNT);

    const { requireCompanyAccess } = await import('../../src/bidpilot/repo/tenants.js');
    const { listPages } = await import('../../src/bidpilot/repo/pages.js');
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const pages = await listPages(scope, res.json.tenderId);
    assert.equal(pages.length, PAGE_COUNT);
    const numbers = pages.map((p) => p.pageNumber).sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: PAGE_COUNT }, (_, i) => i + 1));
    // Not a hard perf assertion (shared CI/sandbox hardware varies) — just a
    // sanity ceiling so a real regression (e.g. someone reintroducing a
    // whole-document AI prompt) shows up here rather than silently.
    assert.ok(Date.now() - start < 45_000, 'large document did not hang the isolated pipeline');
  });
});
