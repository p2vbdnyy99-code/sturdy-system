// The TenderTez team's own visits are left out of the visit counts and of
// Google Analytics (src/bidpilot/staff.js, visits.js).
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { setDb, closeDb, getDb } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createVisitsRouter } from '../../src/bidpilot/visits.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { config } from '../../src/config.js';
import {
  createStaffCheck, hasStaffMarker, isStaffSession, staffCookieOptions, STAFF_COOKIE_NAME,
} from '../../src/bidpilot/staff.js';

const FOUNDER = 'founder@example.test';
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

test('the staff marker: only "1" counts; the cookie is HttpOnly, Lax and lasts 400 days', () => {
  assert.equal(hasStaffMarker({ cookies: { [STAFF_COOKIE_NAME]: '1' } }), true);
  assert.equal(hasStaffMarker({ cookies: { [STAFF_COOKIE_NAME]: 'yes' } }), false);
  assert.equal(hasStaffMarker({ cookies: {} }), false);
  assert.equal(hasStaffMarker({}), false);
  const o = staffCookieOptions();
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, 'lax');
  assert.equal(o.path, '/');
  assert.equal(o.maxAge, 400 * 86_400_000);
});

test('team visits are neither stored nor forwarded; everyone else\'s are', { skip: !dbAvailable() && 'DATABASE_URL not set' }, async (t) => {
  const db = testDb();
  const forwarded = [];
  let server; let baseUrl;
  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createVisitsRouter({
      ownHosts: ['tendertez.in'],
      forward: (v) => { forwarded.push(v); },
      isStaff: createStaffCheck({ db: getDb, adminEmails: [FOUNDER] }),
    }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });

  let founderToken; let customerToken;
  t.beforeEach(async () => {
    await truncateAll();
    forwarded.length = 0;
    const [founder] = await db.insert(users).values({ email: FOUNDER, status: 'ACTIVE' }).returning();
    const [customer] = await db.insert(users).values({ email: 'buyer@example.test', status: 'ACTIVE' }).returning();
    founderToken = (await createSession(db, founder.id)).rawToken;
    customerToken = (await createSession(db, customer.id)).rawToken;
  });

  const post = (cookie) => new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ path: '/pricing' }));
    const headers = { 'content-type': 'application/json', 'content-length': payload.length, 'user-agent': CHROME };
    if (cookie) headers.cookie = cookie;
    const r = http.request(`${baseUrl}/bidpilot/visit`, { method: 'POST', headers }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    r.on('error', reject); r.write(payload); r.end();
  });
  const count = async () => (await db.execute('select count(*)::int as n from page_views')).rows[0].n;
  const settle = () => new Promise((r) => setTimeout(r, 200));

  await t.test('signed in as a team account: not counted, not sent to GA4', async () => {
    assert.equal(await post(`${SESSION_COOKIE_NAME}=${founderToken}`), 204);
    await settle();
    assert.equal(await count(), 0);
    assert.equal(forwarded.length, 0);
  });

  await t.test('signed out on a marked browser: not counted', async () => {
    assert.equal(await post(`${STAFF_COOKIE_NAME}=1`), 204);
    await settle();
    assert.equal(await count(), 0);
    assert.equal(forwarded.length, 0);
  });

  await t.test('a customer, an unknown session and an anonymous visitor are counted', async () => {
    await post(`${SESSION_COOKIE_NAME}=${customerToken}`);
    await post(`${SESSION_COOKIE_NAME}=not-a-real-token`);
    await post(null);
    await settle();
    assert.equal(await count(), 3);
    assert.equal(forwarded.length, 3);
  });

  await t.test('the check reads the session without extending it', async () => {
    const before = (await db.execute('select last_seen_at from sessions order by created_at limit 1')).rows[0].last_seen_at;
    assert.equal(await isStaffSession(db, founderToken, [FOUNDER]), true);
    assert.equal(await isStaffSession(db, customerToken, [FOUNDER]), false);
    assert.equal(await isStaffSession(db, founderToken, []), false, 'no team list: nobody is staff');
    const after = (await db.execute('select last_seen_at from sessions order by created_at limit 1')).rows[0].last_seen_at;
    assert.deepEqual(after, before);
  });
});

test('in production the marker cookie is Secure, like the session cookie', () => {
  // cookies.js decides Secure once, when it is first loaded, so this runs in
  // a fresh process with production settings.
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.BIDPILOT_COOKIE_SECURE;
  delete env.RENDER_EXTERNAL_URL;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    "const s = await import('./src/bidpilot/staff.js'); const c = await import('./src/bidpilot/auth/cookies.js');"
    + ' console.log(JSON.stringify({ staff: s.staffCookieOptions().secure, session: c.sessionCookieOptions(1000).secure }));',
  ], { cwd: BACKEND_DIR, env, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out.trim().split('\n').at(-1)), { staff: true, session: true });
});

test('signing out keeps the marker, so the browser stays uncounted', {
  skip: !dbAvailable() ? 'DATABASE_URL not set' : !process.env.BIDPILOT_CSRF_SECRET && 'BIDPILOT_CSRF_SECRET not set',
}, async (t) => {
  const db = testDb();
  const saved = config.bidpilot.adminEmails;
  let server; let baseUrl;
  t.before(async () => {
    config.bidpilot.adminEmails = [FOUNDER];
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createVisitsRouter({ ownHosts: ['tendertez.in'], isStaff: createStaffCheck({ db: getDb, adminEmails: [FOUNDER] }) }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    config.bidpilot.adminEmails = saved;
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });

  const call = (method, p, headers = {}, data = null) => new Promise((resolve, reject) => {
    const payload = data ? Buffer.from(JSON.stringify(data)) : null;
    const h = { 'user-agent': CHROME, ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}) };
    const r = http.request(`${baseUrl}${p}`, { method, headers: h }, (res) => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode, cookies: res.headers['set-cookie'] || [] }));
    });
    r.on('error', reject); if (payload) r.write(payload); r.end();
  });

  await t.test('the founder signs in, opens the app, signs out, and browses signed out', async () => {
    await truncateAll();
    const [founder] = await db.insert(users).values({ email: FOUNDER, status: 'ACTIVE' }).returning();
    const { rawToken, session } = await createSession(db, founder.id);
    const signedIn = { cookie: `${SESSION_COOKIE_NAME}=${rawToken}`, 'x-csrf-token': csrfTokenFor(session.tokenHash) };
    const me = await call('GET', '/bidpilot/me', signedIn);
    assert.ok(me.cookies.some((c) => c.startsWith(`${STAFF_COOKIE_NAME}=1;`)), 'marker set by /me');
    const out = await call('POST', '/bidpilot/logout', signedIn, {});
    assert.equal(out.status, 200);
    assert.ok(out.cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=;`)), 'session cookie cleared');
    assert.ok(!out.cookies.some((c) => c.startsWith(`${STAFF_COOKIE_NAME}=`)), 'logout leaves the marker alone');
    // The browser now sends only the marker (and a dead session cookie).
    assert.equal((await call('POST', '/bidpilot/visit', { cookie: `${STAFF_COOKIE_NAME}=1; ${SESSION_COOKIE_NAME}=${rawToken}` }, { path: '/pricing' })).status, 204);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await db.execute('select count(*)::int as n from page_views')).rows[0].n, 0, 'still not counted after signing out');
  });
});
