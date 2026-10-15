// The tender feed: the CPPP list parsers (on saved real pages), where each
// tender can be found, the polite collector (network stubbed), the public
// tender search, and the in-app feed with Track and attaching a document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { parseCpppList, parseLastPage, cpppPageUrl, cpppIdFromUrl, CPPP_LISTS } from '../../src/bidpilot/discovery/cppp.js';
import { findOnPortal, normaliseState, LINK_HOSTS } from '../../src/bidpilot/discovery/portals.js';
import { createCrawler, setDiscoveryFetch, USER_AGENT } from '../../src/bidpilot/discovery/collector.js';
import { parseFeedQuery } from '../../src/bidpilot/repo/publicTenders.js';
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
import { createPublicTendersRouter } from '../../src/bidpilot/routes/publicTenders.js';
import { _reset as resetRateLimits } from '../../src/ratelimit.js';
import { parseGemDocumentLink, isGemViewUrl, setGemDocumentFetch, _resetGemDocumentCache } from '../../src/bidpilot/discovery/gemDocument.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, '..', 'fixtures', 'cppp', `${name}.html`), 'utf8');
const PAGES = { central: fixture('central'), state: fixture('state'), gem: fixture('gem') };

test('parser: the central list (saved real page)', () => {
  const { rows, tableFound } = parseCpppList(PAGES.central, 'central');
  assert.equal(tableFound, true);
  assert.equal(rows.length, 10);
  assert.equal(parseLastPage(PAGES.central), 2889);
  const ntpc = rows.find((r) => r.tenderId === '2026_NTPC_112765_1');
  assert.deepEqual(ntpc, {
    source: 'cppp', kind: 'central', sourceKey: '14203231',
    title: 'Procurement of KBL Spares for Stage 3 and Stage 2 Offsite Area at NTPC',
    reference: 'NTPC/USSC-CPG3/9900335329', tenderId: '2026_NTPC_112765_1',
    organisation: 'NTPC Limited', state: null, department: null, category: null,
    publishedAt: ntpc.publishedAt, closingAt: ntpc.closingAt, openingAt: ntpc.openingAt,
    url: null,
  });
  const cpwd = rows[0];
  assert.equal(cpwd.organisation, 'Central Public Works Department (CPWD)');
  assert.equal(cpwd.reference, null, 'a reference that repeats the title is dropped');
  assert.equal(cpwd.closingAt.toISOString(), '2026-10-22T09:30:00.000Z', '22-Oct-2026 03:00 PM IST');
  assert.ok(rows.every((r) => r.url === null), 'no session-bound tendersfullview link is kept');
});

test('parser: the state list keeps the state name', () => {
  const { rows } = parseCpppList(PAGES.state, 'state');
  assert.equal(rows.length, 10);
  assert.equal(parseLastPage(PAGES.state), 5962);
  assert.equal(rows[0].state, 'Keralam');
  assert.equal(rows[0].tenderId, '2026_LSGD_879434_12');
  assert.equal(rows[0].sourceKey, '208090969', 'the portal id from the tendersfullviewmmp link');
  assert.equal(rows[0].organisation, null);
  assert.ok(rows.every((r) => r.kind === 'state' && r.source === 'cppp-state' && r.url === null && r.state));
});

test('parser: the GeM list keeps the bid number, department and a stable link', () => {
  const { rows } = parseCpppList(PAGES.gem, 'gem');
  assert.equal(rows.length, 3);
  assert.equal(parseLastPage(PAGES.gem), 3814);
  const [codes, leak] = rows;
  assert.equal(codes.tenderId, 'GEM/2026/B/7978179');
  assert.equal(codes.category, null, 'a list of item codes is not shown as a category');
  assert.equal(codes.title, 'GeM bid GEM/2026/B/7978179');
  assert.equal(codes.organisation, 'Hindustan Aeronautics Limited (HAL)');
  assert.equal(codes.department, 'Department of Defence Production');
  assert.equal(leak.title, 'Portable/Mobile Mass Spectrometer Helium Leak Detector');
  assert.equal(leak.reference, 'Quantity 2');
  assert.match(leak.url, /^https:\/\/eprocure\.gov\.in\/cppp\/gemtendersfullview\/[A-Za-z0-9+/=]+$/);
  assert.equal(leak.closingAt.toISOString(), '2026-10-16T08:30:00.000Z');
});

test('parser: page links match the portal\'s own pager, and odd pages are refused', () => {
  assert.equal(cpppPageUrl('central', 1), CPPP_LISTS.central.url);
  assert.ok(PAGES.central.includes(`href="${cpppPageUrl('central', 2)}"`), 'page 2 link is the one the portal prints');
  assert.ok(PAGES.state.includes(`href="${cpppPageUrl('state', 5962)}"`));
  assert.deepEqual(parseCpppList('<html>Please solve the captcha</html>', 'central'), { rows: [], tableFound: false });
  assert.equal(parseLastPage('<html></html>'), null);
  assert.equal(cpppIdFromUrl('https://eprocure.gov.in/cppp/tendersfullview/notbase64'), null);
});

test('portals: every tender gets an https link on a known government host', () => {
  assert.equal(normaliseState('NCT of Delhi'), 'delhi');
  assert.equal(normaliseState('Keralam'), 'kerala');
  assert.equal(normaliseState('Ladakh UT'), 'ladakh');
  const kerala = findOnPortal({ kind: 'state', state: 'Keralam', tenderId: '2026_LSGD_879434_12' });
  assert.equal(kerala.url, 'https://etenders.kerala.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page');
  assert.equal(kerala.searchFor, '2026_LSGD_879434_12');
  const unknown = findOnPortal({ kind: 'state', state: 'Andhra Pradesh', tenderId: 'X' });
  assert.equal(unknown.url, 'https://eprocure.gov.in/cppp/tendersearch', 'a state without a checked portal falls back to CPPP');
  const central = findOnPortal({ kind: 'central', tenderId: '2026_NTPC_112765_1' });
  assert.equal(central.label, 'Search on CPPP');
  const gem = findOnPortal({ kind: 'gem', tenderId: 'GEM/2026/B/1', url: 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=' });
  assert.equal(gem.searchFor, null, 'the GeM link opens the bid itself');
  for (const list of ['central', 'state', 'gem']) {
    for (const row of parseCpppList(PAGES[list], list).rows) {
      const u = new URL(findOnPortal(row).url);
      assert.equal(u.protocol, 'https:');
      assert.ok(LINK_HOSTS.has(u.host), `${u.host} is allow-listed`);
      assert.ok(!u.pathname.includes('tendersfullview/') || list === 'gem', 'no session-bound link');
    }
  }
});

test('GeM document: the link on a saved real GeM page, and only CPPP GeM pages are fetched', () => {
  assert.equal(parseGemDocumentLink(fixture('gem-view')),
    'https://bidplus.gem.gov.in/doc_cppp/QIR1TV-89CMqf4eE6v3jszbgFydz1q8Tozz7plvMaZq0VspgxwamQJjABWPKF6bneZUTxMJxxTdbkArGGptF1A');
  assert.equal(parseGemDocumentLink('<a href="https://evil.example/doc_cppp/x">x</a>'), null);
  assert.equal(isGemViewUrl('https://eprocure.gov.in/cppp/gemtendersfullview/abc='), true);
  for (const bad of ['https://evil.example/cppp/gemtendersfullview/abc=', 'http://eprocure.gov.in/cppp/gemtendersfullview/abc=',
    'https://eprocure.gov.in/cppp/tendersfullview/abc=', 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=/../x', null]) {
    assert.equal(isGemViewUrl(bad), false, String(bad));
  }
});

test('feed query: defaults, limits and bad input', () => {
  const d = parseFeedQuery({});
  assert.deepEqual(d.filters, { kind: 'all', status: 'open', sort: 'newest', page: 1, limit: 25, search: '', state: '', organisation: '' });
  assert.equal(parseFeedQuery({ limit: '500' }).filters.limit, 50);
  assert.equal(parseFeedQuery({ when: 'closed' }).filters.status, 'closed', 'the first feed\'s parameter still works');
  assert.equal(parseFeedQuery({ kind: 'railways' }).ok, false);
  assert.equal(parseFeedQuery({ status: 'won' }).ok, false);
  assert.equal(parseFeedQuery({ page: '5000' }).ok, false);
  assert.equal(parseFeedQuery({ search: 'x'.repeat(500) }).filters.search.length, 100);
});

const SKIP_DB = !dbAvailable() && 'DATABASE_URL not set';

// A small fake portal: each list has `last` pages; any page past that comes
// back as an empty list (what the portal shows past its end).
const b64 = (s) => Buffer.from(String(s)).toString('base64');
function fakeListPage(list, n, last) {
  const pager = `<div class="pager"><a href="#" class="paginate_button">${last}</a></div>`;
  const rows = n > last ? [] : [0, 1].map((i) => {
    const id = `${list === 'state' ? 7 : 1}${n}${i}000`;
    const cells = (a, b) => `<tr><td>${i + 1}.</td><td>15-Oct-2026 10:00 AM</td><td>30-Oct-2026 03:00 PM</td>${a}${b}</tr>`;
    if (list === 'gem') {
      return `<tr><td>${i + 1}.</td><td>01-Oct-2026 10:00 AM</td><td>30-Oct-2026 03:00 PM</td>`
        + `<td><a href="https://eprocure.gov.in/cppp/gemtendersfullview/${b64(id)}">GEM/2026/B/${id}</a>/5</td>`
        + `<td>Office chairs</td><td>Org ${n}</td><td>Dept ${n}</td></tr>`;
    }
    const view = list === 'state' ? 'tendersfullviewmmp' : 'tendersfullview';
    return cells(`<td>16-Oct-2026 11:00 AM</td><td><a href="https://eprocure.gov.in/cppp/${view}/${b64(id)}A13h1${b64('x')}">Work ${list} ${n}.${i}</a>/REF/${n}/2026_X_${id}_1</td>`,
      `<td>${list === 'state' ? 'Maharashtra' : `Org ${n}`}</td>`).replace('<td>16-Oct-2026 11:00 AM</td><td><a', '<td>16-Oct-2026 11:00 AM</td><td><a');
  });
  return `<html><body>${pager}<table id="table"><tr><th>Sl.No</th></tr>${rows.join('')}</table></body></html>`;
}

test('collector: fresh pages first, then a full sweep that is saved and resumed', { skip: SKIP_DB }, async () => {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
  setDb(pool);
  const db = testDb();
  await truncateAll();
  const LAST = { central: 4, state: 2, gem: 2 };
  const calls = [];
  let reply = null; // when set, every request gets this instead of a list page
  setDiscoveryFetch(async (url, opts) => {
    calls.push({ url, ua: opts.headers['User-Agent'] });
    if (reply) return { status: reply.status, text: async () => reply.body };
    for (const list of ['central', 'state', 'gem']) {
      for (let n = 1; n <= 6; n += 1) {
        if (cpppPageUrl(list, n) === url) return { status: 200, text: async () => fakeListPage(list, n, LAST[list]) };
      }
    }
    throw new Error(`unexpected URL ${url}`);
  });
  const clock = new Date('2026-10-15T08:00:00Z');
  const day = (n) => new Date(clock.getTime() + n * 86400000).toISOString();
  await db.execute(`insert into public_tenders (source, source_key, kind, title, closing_at) values
    ('cppp', 'old', 'central', 'Closed 61 days ago', '${day(-61)}'), ('cppp', 'recent', 'central', 'Closed 30 days ago', '${day(-30)}')`);
  const opts = { lists: ['central', 'state', 'gem'], freshEveryMs: 10 * 60 * 1000, keepClosedDays: 60, now: () => clock };
  const label = (d) => `${d.fresh ? 'fresh' : 'sweep'} ${d.list} ${d.page}`;
  try {
    const crawler = createCrawler(db, opts);
    const steps = [];
    for (let i = 0; i < 12; i += 1) steps.push(label(await crawler.step()));
    assert.deepEqual(steps, [
      'fresh central 1', 'fresh central 2', 'fresh central 3', 'fresh state 1', 'fresh state 2', 'fresh state 3',
      'sweep central 1', 'sweep state 1', 'sweep gem 1', 'sweep central 2', 'sweep state 2', 'sweep gem 2',
    ]);
    assert.ok(calls.every((c) => c.ua === USER_AGENT), 'every request identifies itself');
    const kept = (await db.execute(`select title from public_tenders where source_key in ('old', 'recent')`)).rows.map((r) => r.title);
    assert.deepEqual(kept, ['Closed 30 days ago'], 'tenders closed over 60 days ago are deleted');
    const state = Object.fromEntries((await db.execute('select list, next_page, total_pages, last_sweep_finished_at from discovery_state')).rows.map((r) => [r.list, r]));
    assert.equal(state.central.next_page, 3);
    assert.equal(state.central.total_pages, 4);
    assert.equal(state.state.next_page, 1, 'a finished sweep starts again at page 1');
    assert.ok(state.state.last_sweep_finished_at);
    const byKind = (await db.execute(`select kind, count(*)::int n from public_tenders where source_key not in ('old','recent') group by kind order by kind`)).rows;
    assert.deepEqual(byKind, [{ kind: 'central', n: 6 }, { kind: 'gem', n: 4 }, { kind: 'state', n: 4 }], 'no duplicates from pages read twice');

    // A restart: a new crawler carries on from the saved page.
    const again = createCrawler(db, { ...opts, lists: ['central'] });
    const next = [];
    for (let i = 0; i < 5; i += 1) next.push(label(await again.step()));
    assert.deepEqual(next, ['fresh central 1', 'fresh central 2', 'fresh central 3', 'sweep central 3', 'sweep central 4']);

    // Errors: a blocked or changed page throws, is recorded, and the same page is tried again.
    reply = { status: 403, body: 'blocked' };
    await assert.rejects(() => again.step(), /403/);
    reply = { status: 200, body: '<html>Enter the captcha</html>' };
    await assert.rejects(() => again.step(), /did not contain the tender list/);
    const after = (await db.execute(`select next_page, last_error from discovery_state where list = 'central'`)).rows[0];
    assert.equal(after.next_page, 1, 'page 4 was the last, so the sweep had wrapped to 1 and stays there');
    assert.match(after.last_error, /tender list/);
    reply = null;
    assert.equal(label(await again.step()), 'sweep central 1');
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

test('public tender search and the in-app feed with Track (HTTP)', { skip: SKIP_HTTP }, async (t) => {
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
    app.use('/bidpilot', createPublicTendersRouter());
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
    resetRateLimits();
    const a = await createCompanyWithOwner(db, { companyName: 'Feed Co', userEmail: 'f@example.com', userName: 'F' });
    company = a.company;
    const { rawToken, session } = await createSession(db, a.user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
    await db.execute(`insert into public_tenders (source, source_key, kind, title, reference, tender_id, organisation, department, state, published_at, closing_at, url) values
      ('cppp', '1', 'central', 'Road repair Pune', 'PWD/1', '2026_CPWD_1_1', 'CPWD', null, null, '${day(-1)}', '${day(20)}', null),
      ('cppp', '2', 'central', 'Supply of cables', 'NTPC/2', '2026_NTPC_2_1', 'NTPC Limited', null, null, '${day(-2)}', '${day(3)}', null),
      ('cppp', '3', 'central', 'Old hostel work', 'IIT/3', '2026_IIT_3_1', 'IIT Bombay', null, null, '${day(-30)}', '${day(-5)}', null),
      ('cppp-state', '4', 'state', 'Village road, Satara', null, '2026_PWD_4_1', null, null, 'Maharashtra', '${day(0)}', '${day(9)}', null),
      ('cppp-state', '5', 'state', 'School building, Kochi', null, '2026_LSGD_5_1', null, null, 'Keralam', '${day(-3)}', '${day(12)}', null),
      ('cppp-gem', 'GEM/2026/B/6', 'gem', 'Office chairs', 'Quantity 40', 'GEM/2026/B/6', 'Indian Railways', 'Ministry of Railways', null, '${day(-4)}', '${day(5)}', 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=')`);
  });

  function send(method, p, { body, raw, contentType, signedOut } = {}) {
    return new Promise((resolve, reject) => {
      const payload = raw ?? (body ? Buffer.from(JSON.stringify(body)) : null);
      const headers = {
        ...(signedOut ? {} : { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf }),
        ...(payload ? { 'content-type': contentType ?? 'application/json', 'content-length': String(payload.length) } : {}),
      };
      const r = http.request(`${baseUrl}${p}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, location: res.headers.location });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }
  const pub = (q = '') => send('GET', `/bidpilot/public/tenders${q}`, { signedOut: true });
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

  await t.test('the public search works signed out, newest first, with each filter', async () => {
    const all = await pub();
    assert.equal(all.status, 200);
    assert.deepEqual(titles(all), ['Village road, Satara', 'Road repair Pune', 'Supply of cables', 'School building, Kochi', 'Office chairs'], 'open only, newest first');
    assert.deepEqual(titles(await pub('?sort=closing')), ['Supply of cables', 'Office chairs', 'Village road, Satara', 'School building, Kochi', 'Road repair Pune']);
    assert.deepEqual(titles(await pub('?kind=state')), ['Village road, Satara', 'School building, Kochi']);
    assert.deepEqual(titles(await pub('?kind=state&state=Keralam')), ['School building, Kochi']);
    assert.deepEqual(titles(await pub('?kind=central&organisation=NTPC%20Limited')), ['Supply of cables']);
    assert.deepEqual(titles(await pub('?kind=gem')), ['Office chairs']);
    assert.deepEqual(titles(await pub('?status=closing')), ['Supply of cables', 'Office chairs']);
    assert.deepEqual(titles(await pub('?status=closed')), ['Old hostel work']);
    assert.deepEqual(titles(await pub('?status=all&search=railways')), ['Office chairs'], 'search covers the department');
    assert.deepEqual(titles(await pub('?status=all&search=2026_LSGD')), ['School building, Kochi'], 'search covers the tender id');
    assert.deepEqual(titles(await pub('?status=all&search=100%25')), [], 'a % in the search is literal');
    assert.equal((await pub('?kind=bogus')).status, 400);
    const page = await pub('?limit=2&page=2');
    assert.deepEqual([page.json.total, page.json.page, page.json.tenders.length], [5, 2, 2]);
  });

  await t.test('each row says where to find it; GeM opens directly, others give the id to search', async () => {
    const rows = (await pub('?status=all&limit=50')).json.tenders;
    const by = Object.fromEntries(rows.map((r) => [r.title, r]));
    assert.deepEqual(by['School building, Kochi'].find, {
      url: 'https://etenders.kerala.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page',
      label: 'Search the Keralam e-tender portal', searchFor: '2026_LSGD_5_1',
    });
    assert.deepEqual(by['Office chairs'].find, { url: 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=', label: 'GeM bid page', searchFor: null });
    assert.equal(by['Road repair Pune'].find.url, 'https://eprocure.gov.in/cppp/tendersearch');
    assert.equal(by['Road repair Pune'].find.searchFor, '2026_CPWD_1_1');
    assert.ok(!('url' in by['Road repair Pune']), 'no raw portal link is sent');
  });

  await t.test('facets count open tenders by list, state and organisation', async () => {
    await db.execute(`insert into discovery_state (list, next_page, total_pages, last_success_at) values ('central', 7, 2889, now())`);
    const f = await send('GET', '/bidpilot/public/tenders/facets', { signedOut: true });
    assert.equal(f.status, 200);
    assert.deepEqual(f.json.open, { central: 2, state: 2, gem: 1 });
    assert.deepEqual(f.json.states, [{ name: 'Keralam', count: 1 }, { name: 'Maharashtra', count: 1 }]);
    assert.deepEqual(f.json.organisations.central.map((o) => o.name).sort(), ['CPWD', 'NTPC Limited'], 'closed IIT tender not counted');
    assert.deepEqual(f.json.organisations.gem, [{ name: 'Indian Railways', count: 1 }]);
    assert.equal(f.json.lists.central.totalPages, 2889);
  });

  await t.test('GeM rows carry a document link that redirects to the PDF on GeM', async () => {
    const DOC = 'https://bidplus.gem.gov.in/doc_cppp/QIR1TV-89CMqf4eE6v3jszbgFydz1q8Tozz7plvMaZq0VspgxwamQJjABWPKF6bneZUTxMJxxTdbkArGGptF1A';
    const fetched = [];
    let page = fixture('gem-view');
    setGemDocumentFetch(async (url) => { fetched.push(url); if (page === null) throw new Error('network down'); return { status: 200, text: async () => page }; });
    _resetGemDocumentCache();
    try {
      const rows = (await pub('?status=all&limit=50')).json.tenders;
      const gem = rows.find((r) => r.kind === 'gem');
      assert.equal(gem.documentUrl, `/bidpilot/public/tenders/${gem.id}/document`);
      assert.ok(rows.filter((r) => r.kind !== 'gem').every((r) => r.documentUrl === null));
      const first = await send('GET', gem.documentUrl, { signedOut: true });
      assert.deepEqual([first.status, first.location], [302, DOC]);
      await send('GET', gem.documentUrl, { signedOut: true });
      assert.deepEqual(fetched, ['https://eprocure.gov.in/cppp/gemtendersfullview/abc='], 'one fetch of the GeM page, then the cache');
      _resetGemDocumentCache();
      page = '<html>no link here</html>';
      assert.equal((await send('GET', gem.documentUrl, { signedOut: true })).location, 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=', 'no link found: the GeM page');
      page = null;
      assert.equal((await send('GET', gem.documentUrl, { signedOut: true })).location, 'https://eprocure.gov.in/cppp/gemtendersfullview/abc=', 'network error: the GeM page');
      const central = rows.find((r) => r.kind === 'central');
      assert.equal((await send('GET', `/bidpilot/public/tenders/${central.id}/document`, { signedOut: true })).status, 404);
      assert.equal((await send('GET', '/bidpilot/public/tenders/not-a-uuid/document', { signedOut: true })).status, 404);
      let last;
      for (let i = 0; i < 20; i += 1) last = await send('GET', gem.documentUrl, { signedOut: true });
      assert.equal(last.status, 429, '20 a minute per visitor');
    } finally {
      setGemDocumentFetch((...a) => fetch(...a));
    }
  });

  await t.test('the public search is rate-limited per visitor', async () => {
    let last;
    for (let i = 0; i < 61; i += 1) last = await pub('?limit=1');
    assert.equal(last.status, 429);
  });

  await t.test('the in-app feed needs a session and uses the same filters', async () => {
    assert.equal((await send('GET', '/bidpilot/feed', { signedOut: true })).status, 401);
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed?kind=gem')), ['Office chairs']);
    assert.deepEqual(titles(await send('GET', '/bidpilot/feed?when=closed')), ['Old hostel work']);
    assert.equal(typeof (await send('GET', '/bidpilot/feed')).json.collecting, 'boolean');
  });

  await t.test('Track adds the tender once (by tender id), without a document, and it cannot be analysed yet', async () => {
    const id = await feedId('School building, Kochi');
    const first = await send('POST', `/bidpilot/feed/${id}/track`, { body: { companyId: company.id } });
    assert.equal(first.status, 201);
    const again = await send('POST', `/bidpilot/feed/${id}/track`, { body: { companyId: company.id } });
    assert.equal(again.json.tenderId, first.json.tenderId);
    assert.equal(again.json.alreadyTracked, true);
    const row = (await db.execute(`select source, status, portal_url, portal_ref, tender_number, organization from tenders where id = '${first.json.tenderId}'`)).rows[0];
    assert.deepEqual(row, {
      source: 'feed', status: 'INTERESTED',
      portal_url: 'https://etenders.kerala.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page',
      portal_ref: '2026_LSGD_5_1', tender_number: '2026_LSGD_5_1', organization: 'Keralam',
    });
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
