// The site's own visit counting (src/bidpilot/visits.js): what is stored,
// what never is, and that a visit request can't fail or be abused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import {
  normalizePath, sourceFrom, campaignFrom, deviceFrom, isBot, istDay, createSaltKeeper, visitorIdFor,
  createVisitRateLimit, retentionCutoff, createVisitsRouter,
} from '../../src/bidpilot/visits.js';
import { setDb, closeDb } from '../../src/db/client.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

test('pages are stored as known routes, never with ids or query strings', () => {
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/pricing/'), '/pricing');
  assert.equal(normalizePath('/register?utm_source=linkedin'), '/register');
  assert.equal(normalizePath('/tenders/9f1c2a3b-0000-4000-8000-000000000000'), '/tenders/:id');
  assert.equal(normalizePath('/privacy-policy#cookies'), '/privacy-policy');
  assert.equal(normalizePath('/wp-admin/setup.php'), '(other)');
  assert.equal(normalizePath('https://evil.example/'), null);
  assert.equal(normalizePath(42), null);
});

test('the source is the referring site, or direct for none, junk and our own site', () => {
  const own = new Set(['tendertez.in', 'www.tendertez.in']);
  assert.equal(sourceFrom('https://www.google.com/', own), 'google.com');
  assert.equal(sourceFrom('https://www.linkedin.com/feed/', own), 'linkedin.com');
  assert.equal(sourceFrom('https://tendertez.in/pricing', own), 'direct');
  assert.equal(sourceFrom('', own), 'direct');
  assert.equal(sourceFrom('not a url', own), 'direct');
});

test('campaign names are kept simple', () => {
  assert.equal(campaignFrom('LinkedIn'), 'linkedin');
  assert.equal(campaignFrom('india_sme-forum.oct'), 'india_sme-forum.oct');
  assert.equal(campaignFrom('<script>'), 'script');
  assert.equal(campaignFrom(''), null);
  assert.equal(campaignFrom(undefined), null);
  assert.equal(campaignFrom('x'.repeat(100)).length, 40);
});

test('phones, desktops and bots', () => {
  assert.equal(deviceFrom(ANDROID), 'mobile');
  assert.equal(deviceFrom(CHROME), 'desktop');
  assert.equal(isBot(CHROME), false);
  for (const ua of ['', 'Googlebot/2.1', 'Mozilla/5.0 HeadlessChrome/130.0', 'WhatsApp/2.23', 'curl/8.0', 'facebookexternalhit/1.1']) {
    assert.equal(isBot(ua), true, ua);
  }
});

test('days are India dates', () => {
  assert.equal(istDay(Date.parse('2026-10-11T18:29:00Z')), '2026-10-11');
  assert.equal(istDay(Date.parse('2026-10-11T18:31:00Z')), '2026-10-12', '00:01 IST is the next day');
  assert.equal(retentionCutoff('2026-10-11'), '2025-09-11');
});

test('the visitor id: stable within a day, new salt (and a different id) the next day', () => {
  const newDays = [];
  const saltFor = createSaltKeeper({ onNewDay: (d) => newDays.push(d) });
  const a = saltFor('2026-10-11');
  assert.equal(saltFor('2026-10-11'), a);
  const b = saltFor('2026-10-12');
  assert.notEqual(a, b);
  assert.deepEqual(newDays, ['2026-10-11', '2026-10-12']);
  const id1 = visitorIdFor(a, '203.0.113.7', CHROME);
  assert.equal(visitorIdFor(a, '203.0.113.7', CHROME), id1);
  assert.notEqual(visitorIdFor(b, '203.0.113.7', CHROME), id1);
  assert.match(id1, /^[0-9a-f]{16}$/);
  assert.ok(!id1.includes('203'), 'not the IP');
});

test('at most 60 counted visits per IP per minute', () => {
  const allow = createVisitRateLimit();
  const t0 = 1_000_000;
  for (let i = 0; i < 60; i++) assert.equal(allow('1.2.3.4', t0), true);
  assert.equal(allow('1.2.3.4', t0), false);
  assert.equal(allow('5.6.7.8', t0), true, 'other IPs unaffected');
  assert.equal(allow('1.2.3.4', t0 + 60_001), true, 'resets after a minute');
});

test('POST /bidpilot/visit (HTTP + database)', { skip: !dbAvailable() && 'DATABASE_URL not set' }, async (t) => {
  const db = testDb();
  let server; let baseUrl;
  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', createVisitsRouter({ ownHosts: ['tendertez.in'] }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });
  t.beforeEach(truncateAll);

  const post = (body, ua = CHROME) => new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const r = http.request(`${baseUrl}/bidpilot/visit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': payload.length, 'user-agent': ua },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.write(payload); r.end();
  });
  const rows = async () => (await db.execute('select * from page_views order by created_at')).rows;
  const settle = () => new Promise((r) => setTimeout(r, 150));

  await t.test('a visit is stored with the page, source, campaign, device and an anonymous id, and nothing else', async () => {
    assert.equal(await post({ path: '/tenders/abc-123?x=1', referrer: 'https://www.linkedin.com/feed/', utm: 'LinkedIn' }, ANDROID), 204);
    await settle();
    const [row] = await rows();
    assert.equal(row.path, '/tenders/:id');
    assert.equal(row.source, 'linkedin.com');
    assert.equal(row.campaign, 'linkedin');
    assert.equal(row.device, 'mobile');
    assert.match(row.visitor_id, /^[0-9a-f]{16}$/);
    assert.equal(row.day, istDay());
    assert.deepEqual(Object.keys(row).sort(), ['campaign', 'created_at', 'day', 'device', 'id', 'path', 'source', 'visitor_id']);
    assert.ok(!JSON.stringify(row).includes('127.0.0.1'), 'no IP address stored');
  });

  await t.test('the same browser on the same day gets the same visitor id', async () => {
    await post({ path: '/' });
    await post({ path: '/pricing', referrer: 'https://tendertez.in/' });
    await settle();
    const [a, b] = await rows();
    assert.equal(a.visitor_id, b.visitor_id);
    assert.equal(b.source, 'direct', 'moving around our own site is not a new source');
  });

  await t.test('bots, missing paths and junk bodies are answered 204 and not stored', async () => {
    assert.equal(await post({ path: '/' }, 'Googlebot/2.1'), 204);
    assert.equal(await post({ path: '/' }, 'Mozilla/5.0 HeadlessChrome/130.0'), 204);
    assert.equal(await post({ nope: true }), 204);
    assert.equal(await post({ path: 'javascript:alert(1)' }), 204);
    await settle();
    assert.equal((await rows()).length, 0);
  });

  await t.test('rows older than about 13 months are deleted when a new day starts', async () => {
    await db.execute("insert into page_views (day, path, source, device, visitor_id) values ('2024-01-01', '/', 'direct', 'desktop', 'old'), (current_date, '/', 'direct', 'desktop', 'recent')");
    // A fresh router has no salt yet, so its first visit starts a new day and runs the cleanup.
    const app = express(); app.use(express.json()); app.use('/bidpilot', createVisitsRouter());
    const s2 = http.createServer(app); await new Promise((r) => s2.listen(0, r));
    await new Promise((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify({ path: '/' }));
      const r = http.request(`http://127.0.0.1:${s2.address().port}/bidpilot/visit`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.length, 'user-agent': CHROME },
      }, (res) => { res.resume(); res.on('end', resolve); });
      r.on('error', reject); r.write(payload); r.end();
    });
    await settle();
    await new Promise((r) => s2.close(r));
    const ids = (await rows()).map((r) => r.visitor_id);
    assert.ok(!ids.includes('old'), 'the 2024 row is gone');
    assert.ok(ids.includes('recent'), 'recent rows are kept');
  });
});
