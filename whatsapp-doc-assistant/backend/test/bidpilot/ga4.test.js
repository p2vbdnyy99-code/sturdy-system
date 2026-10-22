// Google Analytics 4 sent by the server (src/bidpilot/ga4.js): what is sent,
// what never is, and that sending can't slow or break a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { buildPageView, createGa4Forwarder, ga4Enabled, GA4_ENDPOINT } from '../../src/bidpilot/ga4.js';
import { createVisitsRouter } from '../../src/bidpilot/visits.js';
import { buildBidpilotConfig } from '../../src/config.js';

const BASE = 'https://tendertez.in';
const VISIT = { day: '2026-10-15', path: '/pricing', source: 'linkedin.com', campaign: 'linkedin', device: 'mobile', visitorId: '0123456789abcdef' };
const SECRET = 's3cr3t-API-value';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function fakeFetch(respond = () => ({ ok: true, status: 204 })) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return respond(url, init); };
  fn.calls = calls;
  return fn;
}
const silent = () => { const lines = []; return { lines, warn: (m) => lines.push(m) }; };

test('settings: on only with a G- measurement ID and an API secret', () => {
  assert.equal(ga4Enabled({ measurementId: 'G-AB12CD34EF', apiSecret: SECRET }), true);
  assert.equal(ga4Enabled({ measurementId: 'G-AB12CD34EF', apiSecret: '' }), false);
  assert.equal(ga4Enabled({ measurementId: 'UA-1234-1', apiSecret: SECRET }), false);
  assert.equal(ga4Enabled({ measurementId: '', apiSecret: SECRET }), false);
  assert.equal(createGa4Forwarder({ measurementId: 'G-AB12CD34EF', baseUrl: BASE }), null);
  const cfg = buildBidpilotConfig({});
  assert.deepEqual(cfg.ga4, { measurementId: '', apiSecret: '', endpoint: GA4_ENDPOINT });
  const on = buildBidpilotConfig({ BIDPILOT_GA4_MEASUREMENT_ID: ' G-AB12CD34EF ', BIDPILOT_GA4_API_SECRET: SECRET });
  assert.equal(on.ga4.measurementId, 'G-AB12CD34EF');
  assert.equal(ga4Enabled(on.ga4), true);
});

test('a public page view: the page, its title, the referring site, the campaign and phone or computer; nothing else', () => {
  const body = buildPageView(VISIT, BASE);
  const dayStart = Math.floor(Date.parse('2026-10-15T00:00:00+05:30') / 1000);
  assert.deepEqual(body, {
    client_id: `${0x01234567}.${dayStart}`,
    events: [{
      name: 'page_view',
      params: {
        page_location: 'https://tendertez.in/pricing?utm_source=linkedin',
        page_title: 'Pricing | TenderTez',
        session_id: String(dayStart),
        engagement_time_msec: 100,
        visit_source: 'linkedin.com',
        page_referrer: 'https://linkedin.com/',
        visit_campaign: 'linkedin',
      },
    }],
    device: { category: 'mobile' },
  });
  const direct = buildPageView({ ...VISIT, path: '/', source: 'direct', campaign: null, device: 'desktop' }, BASE);
  assert.equal(direct.events[0].params.page_location, 'https://tendertez.in/');
  assert.equal(direct.events[0].params.page_referrer, undefined);
  assert.equal(direct.events[0].params.visit_campaign, undefined);
  assert.equal(direct.device.category, 'desktop');
  for (const path of ['/government-tenders', '/features', '/register']) assert.ok(buildPageView({ ...VISIT, path }, BASE), path);
});

test('signed-in pages, sign-in pages and anything unknown are never sent', () => {
  for (const path of ['/dashboard', '/tenders/:id', '/company-profile', '/login', '/verify-email', '/onboarding/create-company', '(other)']) {
    assert.equal(buildPageView({ ...VISIT, path }, BASE), null, path);
  }
  assert.equal(buildPageView({ ...VISIT, visitorId: 'not-an-id' }, BASE), null);
  assert.equal(buildPageView({ ...VISIT, day: 'yesterday' }, BASE), null);
});

test('the request: POST to the endpoint with the ID and secret, JSON body, no IP or browser description', async () => {
  const fetchImpl = fakeFetch();
  const forward = createGa4Forwarder({ measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, fetchImpl });
  assert.equal(await forward(VISIT), true);
  assert.equal(fetchImpl.calls.length, 1);
  const [{ url, init }] = fetchImpl.calls;
  assert.equal(url, `${GA4_ENDPOINT}?measurement_id=G-AB12CD34EF&api_secret=${SECRET}`);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/json');
  assert.doesNotMatch(init.body, /127\.0\.0\.1|ip_override|user_agent|Mozilla|user_id/);
  assert.equal(await forward({ ...VISIT, path: '/dashboard' }), false);
  assert.equal(fetchImpl.calls.length, 1, 'a signed-in page makes no request');
});

test('a failure, a refusal or a timeout never throws, and the secret is never logged', async () => {
  const logger = silent();
  const failing = createGa4Forwarder({
    measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, logger,
    fetchImpl: async (url) => { throw new TypeError(`fetch failed for ${url}`); },
  });
  assert.equal(await failing(VISIT), false);
  const refused = createGa4Forwarder({ measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, logger, fetchImpl: fakeFetch(() => ({ ok: false, status: 403 })) });
  assert.equal(await refused(VISIT), false);
  const slow = createGa4Forwarder({
    measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, logger, timeoutMs: 50,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
  });
  const started = Date.now();
  // AbortSignal.timeout's timer doesn't hold the event loop open; this one does, for the test only.
  const keepAlive = setTimeout(() => {}, 2000);
  assert.equal(await slow(VISIT), false);
  clearTimeout(keepAlive);
  assert.ok(Date.now() - started < 1000, 'gave up quickly');
  assert.ok(logger.lines.length >= 1);
  for (const line of logger.lines) assert.ok(!line.includes(SECRET) && !line.includes('api_secret'), line);
  assert.match(logger.lines[0], /ga4: a page view was not sent \(TypeError\)/);
});

test('repeated failures are logged at most once every 10 minutes', async () => {
  const logger = silent();
  const forward = createGa4Forwarder({ measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, logger, fetchImpl: fakeFetch(() => ({ ok: false, status: 500 })) });
  for (let i = 0; i < 5; i += 1) await forward(VISIT);
  assert.deepEqual(logger.lines, ['ga4: a page view was not sent (HTTP 500)']);
});

test('POST /bidpilot/visit hands public visits to the forwarder after the 204, and never bots or signed-in pages', async (t) => {
  const forwarded = [];
  const rows = [];
  const db = { insert: () => ({ values: async (v) => { rows.push(v); } }), delete: () => ({ where: async () => {} }) };
  const forwardFetch = fakeFetch();
  const forward = createGa4Forwarder({ measurementId: 'G-AB12CD34EF', apiSecret: SECRET, baseUrl: BASE, fetchImpl: forwardFetch });
  const app = express();
  app.use(express.json());
  app.use('/bidpilot', createVisitsRouter({ ownHosts: ['tendertez.in'], db, forward: (v) => { forwarded.push(v); return forward(v); } }));
  const throwing = express();
  throwing.use(express.json());
  throwing.use('/bidpilot', createVisitsRouter({ db, forward: () => { throw new Error('boom'); } }));
  const servers = [http.createServer(app), http.createServer(throwing)];
  await Promise.all(servers.map((s) => new Promise((r) => s.listen(0, r))));
  t.after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

  const post = (server, body, ua = CHROME) => new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const r = http.request(`http://127.0.0.1:${server.address().port}/bidpilot/visit`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': payload.length, 'user-agent': ua },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.write(payload); r.end();
  });
  const settle = () => new Promise((r) => setTimeout(r, 100));

  assert.equal(await post(servers[0], { path: '/features', referrer: 'https://www.google.com/', utm: '' }), 204);
  assert.equal(await post(servers[0], { path: '/dashboard' }), 204);
  assert.equal(await post(servers[0], { path: '/' }, 'Googlebot/2.1'), 204);
  await settle();
  assert.equal(rows.length, 2, 'both people-visits still recorded');
  assert.equal(forwarded.length, 2, 'the forwarder sees counted visits only (no bot)');
  assert.equal(forwardFetch.calls.length, 1, 'only the public page reaches Google');
  assert.equal(forwardFetch.calls[0].body.events[0].params.page_location, 'https://tendertez.in/features');
  assert.equal(forwardFetch.calls[0].body.events[0].params.visit_source, 'google.com');

  assert.equal(await post(servers[1], { path: '/' }), 204, 'a throwing forwarder never fails the visit');
  await settle();
  assert.equal(rows.length, 3, 'and the row is still recorded');
});
