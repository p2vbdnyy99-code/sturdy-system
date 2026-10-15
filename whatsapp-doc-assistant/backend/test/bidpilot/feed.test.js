// The tender feed: the CPPP page parser, the polite collector (network
// stubbed), and the feed API with Track and attaching a document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import { parseCpppLatest, cpppIdFromUrl, CPPP_LATEST_URL } from '../../src/bidpilot/discovery/cppp.js';
import { collectCpppOnce, setDiscoveryFetch, USER_AGENT } from '../../src/bidpilot/discovery/collector.js';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { setStorage } from '../../src/bidpilot/storage/index.js';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createFeedRouter } from '../../src/bidpilot/routes/feed.js';

// The real page's structure (one header row, then rows of six cells) with
// made-up tenders. Ids are base64 numbers, as on the portal.
const b64 = (s) => Buffer.from(s).toString('base64');
const link = (id, rest) => `https://eprocure.gov.in/cppp/tendersfullview/${b64(id)}A13h1${b64(rest)}`;
const row = (n, pub, close, open, url, title, tail, org) => `<tr><td>${n}.</td><td>${pub}</td><td>${close}</td><td>${open}</td>`
  + `<td><a href="${url}" title="External Url">${title}</a>${tail}</td><td>${org}</td><td>--</td></tr>`;
const page = (rows) => `<html><body><form><div class="captcha">captcha for search</div></form>
<table id="table" class="list_table"><tr><th>Sl.No</th><th>e-Published Date</th><th>Closing</th><th>Opening</th><th>Title</th><th>Org</th><th>Corr</th></tr>
${rows.join('\n')}</table></body></html>`;

const SAMPLE = page([
  row(1, '15-Oct-2026 12:00 PM', '05-Nov-2026 06:00 PM', '12-Nov-2026 10:00 AM', link('14203170', 'x'),
    'ROAD REPAIR WORK AT PUNE &amp; NEARBY', '/PWD/E8/2026_PWD_123456_1', 'PUBLIC WORKS DEPARTMENT'),
  row(2, '15-Oct-2026 11:00 AM', '20-Oct-2026 03:00 PM', '21-Oct-2026 11:00 AM', link('14203171', 'y'),
    'SUPPLY OF CABLES', '/MSEB/2026/77/2026_MSEB_9_1', 'STATE ELECTRICITY BOARD'),
  row(3, '15-Oct-2026 11:00 AM', '20-Oct-2026 03:00 PM', '21-Oct-2026 11:00 AM', 'https://evil.example.com/x',
    'NOT A CPPP LINK', '/A/B', 'NOBODY'),
]);

test('parser: reads each row, its portal id, reference and IST dates; skips foreign links', () => {
  const { rows, tableFound } = parseCpppLatest(SAMPLE);
  assert.equal(tableFound, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    sourceKey: '14203170',
    title: 'ROAD REPAIR WORK AT PUNE & NEARBY',
    reference: 'PWD/E8 · 2026_PWD_123456_1',
    organisation: 'PUBLIC WORKS DEPARTMENT',
    publishedAt: new Date('2026-10-15T06:30:00.000Z'),
    closingAt: new Date('2026-11-05T12:30:00.000Z'),
    openingAt: new Date('2026-11-12T04:30:00.000Z'),
    url: link('14203170', 'x'),
  });
  assert.equal(cpppIdFromUrl('https://eprocure.gov.in/cppp/tendersfullview/notbase64'), null);
  assert.deepEqual(parseCpppLatest('<html>Please solve the captcha</html>'), { rows: [], tableFound: false });
});

const SKIP_DB = !dbAvailable() && 'DATABASE_URL not set';

test('collector: identifies itself, stores rows once, refreshes them, and stops on anything unexpected', { skip: SKIP_DB }, async () => {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
  setDb(pool);
  const db = testDb();
  await truncateAll();
  const calls = [];
  let reply = { status: 200, body: SAMPLE };
  setDiscoveryFetch(async (url, opts) => { calls.push({ url, ua: opts.headers['User-Agent'] }); return { status: reply.status, text: async () => reply.body }; });
  try {
    assert.deepEqual(await collectCpppOnce(db), { stored: 2 });
    assert.deepEqual(await collectCpppOnce(db), { stored: 2 });
    const rows = (await db.execute('select source_key, title from public_tenders order by source_key')).rows;
    assert.deepEqual(rows.map((r) => r.source_key), ['14203170', '14203171'], 'no duplicates on a second read');
    assert.equal(calls[0].url, CPPP_LATEST_URL);
    assert.equal(calls[0].ua, USER_AGENT);
    reply = { status: 403, body: 'blocked' };
    await assert.rejects(() => collectCpppOnce(db), /403/);
    reply = { status: 200, body: '<html>captcha</html>' };
    await assert.rejects(() => collectCpppOnce(db), /did not contain the tender list/);
  } finally {
    setDiscoveryFetch((...a) => fetch(...a));
    await closeDb();
  }
});

const SKIP_HTTP = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('feed API, Track and attaching the document (HTTP)', { skip: SKIP_HTTP }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let auth;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feed-'));
    setStorage(new LocalDiskStorage({ dir, publicBaseUrl: 'http://localhost', signingSecret: 'feed-test-secret' }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createTendersRouter());
    app.use('/bidpilot', createFeedRouter());
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
    const a = await createCompanyWithOwner(db, { companyName: 'Feed Co', userEmail: 'f@example.com', userName: 'F' });
    company = a.company;
    const { rawToken, session } = await createSession(db, a.user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
    await db.execute(`insert into public_tenders (source, source_key, title, reference, organisation, published_at, closing_at, url) values
      ('cppp', '1', 'Road repair Pune', 'PWD/1', 'PWD', now(), '${day(20)}', 'https://eprocure.gov.in/cppp/tendersfullview/a'),
      ('cppp', '2', 'Supply of cables', 'MSEB/2', 'MSEB', now(), '${day(3)}', 'https://eprocure.gov.in/cppp/tendersfullview/b'),
      ('cppp', '3', 'Old hostel work', 'IIT/3', 'IIT', now(), '${day(-5)}', 'https://eprocure.gov.in/cppp/tendersfullview/c')`);
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
  const titles = (res) => res.json.tenders.map((x) => x.title);
  const feedId = async (title) => (await db.execute(`select id from public_tenders where title = '${title}'`)).rows[0].id;
  const attach = (tenderId, name) => {
    const boundary = '----feed' + Math.random().toString(16).slice(2);
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="companyId"\r\n\r\n${company.id}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return send('POST', `/bidpilot/tenders/${tenderId}/document`, { raw, contentType: `multipart/form-data; boundary=${boundary}` });
  };

  await t.test('the feed lists open, closing-soon and closed tenders, and searches', async () => {
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed')), ['Supply of cables', 'Road repair Pune'], 'open, soonest first');
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed?when=closing')), ['Supply of cables']);
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed?when=closed')), ['Old hostel work']);
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed?when=all&search=pune')), ['Road repair Pune']);
    const res = await send('GET', '/bidpilot/feed?when=all');
    assert.equal(res.json.total, 3);
    assert.equal(res.json.coverage.stored, 3);
    assert.equal(typeof res.json.coverage.collecting, 'boolean');
  });

  await t.test('Track adds the tender once, without a document, and it cannot be analysed yet', async () => {
    const id = await feedId('Road repair Pune');
    const first = await send('POST', `/bidpilot/feed/${id}/track`, { body: { companyId: company.id } });
    assert.equal(first.status, 201);
    const again = await send('POST', `/bidpilot/feed/${id}/track`, { body: { companyId: company.id } });
    assert.equal(again.json.tenderId, first.json.tenderId);
    assert.equal(again.json.alreadyTracked, true);
    const row = (await db.execute(`select source, status, portal_url, tender_number from tenders where id = '${first.json.tenderId}'`)).rows[0];
    assert.deepEqual(row, { source: 'feed', status: 'INTERESTED', portal_url: 'https://eprocure.gov.in/cppp/tendersfullview/a', tender_number: 'PWD/1' });
    const analyse = await send('POST', `/bidpilot/tenders/${first.json.tenderId}/analyze`, { body: { companyId: company.id } });
    assert.equal(analyse.status, 409);
    assert.equal(analyse.json.code, 'no_document');
    const usage = (await db.execute('select count(*)::int n from usage_records')).rows[0].n;
    assert.equal(usage, 0, 'no trial or plan slot used');
  });

  await t.test('tracked tenders without a document do not use up the free tenders without a profile', async () => {
    const tracked = [];
    for (const title of ['Road repair Pune', 'Supply of cables', 'Old hostel work']) {
      tracked.push((await send('POST', `/bidpilot/feed/${await feedId(title)}/track`, { body: { companyId: company.id } })).json.tenderId);
    }
    assert.equal((await attach(tracked[0], 'a.pdf')).status, 201, '1st document');
    assert.equal((await attach(tracked[1], 'b.pdf')).status, 201, '2nd document');
    const third = await attach(tracked[2], 'c.pdf');
    assert.equal(third.status, 409, '3rd needs the profile');
    assert.equal(third.json.code, 'profile_incomplete');
    assert.equal((await attach(tracked[0], 'again.pdf')).status, 409, 'a tender gets only one document');
  });

  await t.test("another company can't track into this company", async () => {
    const other = await createCompanyWithOwner(db, { companyName: 'Other', userEmail: 'o@example.com', userName: 'O' });
    const res = await send('POST', `/bidpilot/feed/${await feedId('Road repair Pune')}/track`, { body: { companyId: other.company.id } });
    assert.equal(res.status, 403);
  });
});
