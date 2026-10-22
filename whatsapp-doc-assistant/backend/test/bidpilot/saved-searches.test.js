// Saved searches and in-app alerts (repo/savedSearches.js): filters, the
// matcher, and the routes over HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import {
  parseSavedFilters, defaultName, createSavedSearch, matchSavedSearches, listSavedSearches, unseenCount, markSeen, listMatches,
} from '../../src/bidpilot/repo/savedSearches.js';
import { publicTenders, savedSearches } from '../../src/db/schema/index.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createFeedRouter } from '../../src/bidpilot/routes/feed.js';
import { createDashboardRouter } from '../../src/bidpilot/routes/dashboard.js';

test('saved filters: the search\'s own filters, at least one of them', () => {
  assert.deepEqual(parseSavedFilters({ kind: 'state', state: ' Maharashtra ', search: 'road  work' }), {
    ok: true, filters: { kind: 'state', state: 'Maharashtra', organisation: '', search: 'road work' },
  });
  assert.deepEqual(parseSavedFilters({ kind: 'gem', organisation: 'Ministry of Defence', state: 'Kerala' }).filters,
    { kind: 'gem', state: '', organisation: 'Ministry of Defence', search: '' }, 'a state only applies to the state list');
  assert.match(parseSavedFilters({}).error, /Choose a list/);
  assert.match(parseSavedFilters({ kind: 'all', search: '   ' }).error, /Choose a list/);
  assert.match(parseSavedFilters({ kind: 'ireps' }).error, /Unknown list/);
  assert.equal(parseSavedFilters({ kind: 'gem' }).ok, true);
  assert.equal(defaultName({ kind: 'state', state: 'Maharashtra', organisation: '', search: 'road' }), 'Maharashtra · “road”');
  assert.equal(defaultName({ kind: 'gem', state: '', organisation: 'Ministry of Defence', search: '' }), 'GeM · Ministry of Defence');
});

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('saved searches and alerts (database + HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let user; let auth; let scope;
  const HOUR = 3600_000;
  const now = new Date();
  const ago = (h) => new Date(now.getTime() - h * HOUR);
  const later = (days) => new Date(now.getTime() + days * 86_400_000);

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createFeedRouter());
    app.use('/bidpilot', createDashboardRouter());
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
    const a = await createCompanyWithOwner(db, { companyName: 'Alert Co', userEmail: 'alert@example.com', userName: 'A' });
    company = a.company; user = a.user;
    const { rawToken, session } = await createSession(db, user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
  });

  function req(method, path, body, who = auth) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${who.cookie}`, 'x-csrf-token': who.csrf,
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
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

  let n = 0;
  async function tenderRow(fields) {
    n += 1;
    const [row] = await db.insert(publicTenders).values({
      source: 'cppp', sourceKey: `k${n}`, kind: 'state', title: `Tender ${n}`, state: 'Maharashtra',
      tenderId: `2026_PWD_${n}_1`, closingAt: later(10), firstSeenAt: ago(0.1), ...fields,
    }).returning();
    return row;
  }
  async function saveAt(filters, hoursAgo) {
    const s = await createSavedSearch(scope, { filters: parseSavedFilters(filters).filters }, user.id);
    await db.update(savedSearches).set({ createdAt: ago(hoursAgo) }).where(eq(savedSearches.id, s.id));
    return s;
  }

  await t.test('only open tenders first seen after saving, matching the filters, each once', async () => {
    const s = await saveAt({ kind: 'state', state: 'Maharashtra', search: 'road' }, 2);
    const hit = await tenderRow({ title: 'Road repair at Pune' });
    await tenderRow({ title: 'Road widening', firstSeenAt: ago(5) }); // seen before saving
    await tenderRow({ title: 'Road works', state: 'Kerala' }); // other state
    await tenderRow({ title: 'Building repair' }); // other words
    await tenderRow({ title: 'Road closed', closingAt: ago(1) }); // already closed
    await tenderRow({ title: 'GeM road cones', kind: 'gem', state: null }); // other list
    const hit2 = await tenderRow({ title: 'Approach ROAD to bridge', firstSeenAt: ago(1) });
    assert.equal(await matchSavedSearches(db, now), 2);
    assert.equal(await matchSavedSearches(db, now), 0, 'a second run adds nothing');
    const matches = await listMatches(scope, { now });
    assert.deepEqual(matches.map((m) => m.tender.id).sort(), [hit.id, hit2.id].sort());
    assert.equal(matches[0].searchName, 'Maharashtra · “road”');
    assert.equal(matches[0].tender.find.label.length > 0, true, 'each match carries where to find it');
    assert.deepEqual((await listSavedSearches(scope)).map((x) => [x.id, x.unseen]), [[s.id, 2]]);
  });

  await t.test('routes: save, list with counts, mark seen, delete; the dashboard shows the count', async () => {
    const saved = await req('POST', '/bidpilot/feed/searches', { companyId: company.id, filters: { kind: 'gem', organisation: 'Indian Army' } });
    assert.equal(saved.status, 201);
    assert.equal(saved.json.name, 'GeM · Indian Army');
    await db.update(savedSearches).set({ createdAt: ago(1) }).where(eq(savedSearches.id, saved.json.id));
    await tenderRow({ kind: 'gem', state: null, organisation: 'Indian Army', title: 'Boots' });
    await tenderRow({ kind: 'gem', state: null, organisation: 'Indian Navy', title: 'Ropes' });
    await matchSavedSearches(db, now);
    const list = await req('GET', `/bidpilot/feed/searches?companyId=${company.id}`);
    assert.equal(list.json.unseen, 1);
    assert.equal(list.json.searches[0].unseen, 1);
    const summary = await req('GET', `/bidpilot/dashboard/summary?companyId=${company.id}`);
    assert.equal(summary.json.newAlerts, 1);
    const alerts = await req('GET', `/bidpilot/feed/alerts?companyId=${company.id}`);
    assert.equal(alerts.json.matches.length, 1);
    assert.equal(alerts.json.matches[0].tender.title, 'Boots');
    assert.equal(alerts.json.matches[0].seen, false);
    const seen = await req('POST', '/bidpilot/feed/alerts/seen', { companyId: company.id, matchIds: [alerts.json.matches[0].matchId] });
    assert.deepEqual(seen.json, { marked: 1, unseen: 0 });
    const again = await req('GET', `/bidpilot/feed/alerts?companyId=${company.id}`);
    assert.equal(again.json.matches[0].seen, true, 'seen matches stay in the list for a while');
    assert.equal((await req('POST', '/bidpilot/feed/alerts/seen', { companyId: company.id, matchIds: ['nope'] })).status, 400);
    assert.equal((await req('POST', '/bidpilot/feed/searches', { companyId: company.id, filters: {} })).status, 400);
    assert.equal((await req('DELETE', `/bidpilot/feed/searches/${saved.json.id}?companyId=${company.id}`)).json.deleted, true);
    assert.deepEqual((await req('GET', `/bidpilot/feed/alerts?companyId=${company.id}`)).json.matches, [], 'its matches go with it');
  });

  await t.test('at most 10 saved searches', async () => {
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await req('POST', '/bidpilot/feed/searches', { companyId: company.id, filters: { search: `word${i}` } })).status, 201);
    }
    const eleventh = await req('POST', '/bidpilot/feed/searches', { companyId: company.id, filters: { search: 'one more' } });
    assert.equal(eleventh.status, 400);
    assert.match(eleventh.json.error, /up to 10/);
  });

  await t.test('another company never sees or clears our searches and alerts', async () => {
    await saveAt({ search: 'bridge' }, 1);
    await tenderRow({ title: 'Bridge repair' });
    await matchSavedSearches(db, now);
    const b = await createCompanyWithOwner(db, { companyName: 'Other Co', userEmail: 'other@example.com', userName: 'O' });
    const { rawToken, session } = await createSession(db, b.user.id);
    const other = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    assert.equal((await req('GET', `/bidpilot/feed/alerts?companyId=${company.id}`, null, other)).status, 403);
    assert.deepEqual((await req('GET', `/bidpilot/feed/alerts?companyId=${b.company.id}`, null, other)).json.matches, []);
    assert.deepEqual((await req('GET', `/bidpilot/feed/searches?companyId=${b.company.id}`, null, other)).json, { searches: [], unseen: 0 });
    const ours = await listMatches(scope, { now });
    const cleared = await req('POST', '/bidpilot/feed/alerts/seen', { companyId: b.company.id, matchIds: [ours[0].matchId] }, other);
    assert.equal(cleared.json.marked, 0);
    const sid = (await listSavedSearches(scope))[0].id;
    assert.equal((await req('DELETE', `/bidpilot/feed/searches/${sid}?companyId=${b.company.id}`, null, other)).status, 404);
    assert.equal(await unseenCount(scope), 1);
    assert.equal(await markSeen(scope), 1, 'marking all clears only our own');
  });
});
