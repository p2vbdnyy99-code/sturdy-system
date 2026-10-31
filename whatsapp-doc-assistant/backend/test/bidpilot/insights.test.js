// The founder's live dashboard (src/bidpilot/insights.js, GET /bidpilot/insights):
// who may see it, and that every count leaves the founder's own accounts out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createInsightsRouter } from '../../src/bidpilot/routes/insights.js';
import { insights, isAdmin } from '../../src/bidpilot/insights.js';
import { config } from '../../src/config.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

const FOUNDER = 'founder@insights.example';

test('isAdmin: only listed emails, any case; phone-only accounts never', () => {
  const list = ['founder@insights.example'];
  assert.equal(isAdmin({ email: 'Founder@Insights.example' }, list), true);
  assert.equal(isAdmin({ email: 'someone@else.example' }, list), false);
  assert.equal(isAdmin({ email: null, phone: '+919800000000' }, list), false);
  assert.equal(isAdmin(null, list), false);
  assert.equal(isAdmin({ email: 'founder@insights.example' }, []), false);
});

test('the default admin list is the founder\'s existing Skylark account', () => {
  assert.ok(config.bidpilot.adminEmails.length >= 1);
});

async function seed(db) {
  const exec = (text, params = []) => db.$client.query(text, params);
  const founder = await createCompanyWithOwner(db, { companyName: 'Skylark', userEmail: FOUNDER, userName: 'F' });
  const alpha = await createCompanyWithOwner(db, { companyName: 'Alpha Bids', userEmail: 'a@alpha.example', userName: 'A' });
  const beta = await createCompanyWithOwner(db, { companyName: 'Beta Infra', userEmail: 'b@beta.example', userName: 'B' });
  const demo = await createCompanyWithOwner(db, { companyName: 'Demo', userEmail: 'demo@insights.example', userName: 'D' });

  const scope = (x) => requireCompanyAccess(db, { userId: x.user.id, companyId: x.company.id });
  const t1 = await createTender(await scope(alpha), { title: 'Road works' });
  const t2 = await createTender(await scope(alpha), { title: 'Pump sets' });
  const tf = await createTender(await scope(founder), { title: 'Founder test' });
  await exec(`update tenders set analysis_status = 'COMPLETED', analyzed_at = now() where id = any($1::uuid[])`, [[t1.id, tf.id]]);
  await exec(`update tenders set analysis_status = 'FAILED' where id = $1`, [t2.id]);

  await exec(`update users set created_at = now() - interval '10 days' where id = $1`, [beta.user.id]);
  await exec(`insert into subscriptions (company_id, plan, status, period_start, period_end)
              values ($1, 'STARTER', 'ACTIVE', now() - interval '1 day', now() + interval '29 days'),
                     ($2, 'UNLIMITED', 'ACTIVE', null, null)`, [alpha.company.id, demo.company.id]);

  const today = "(now() at time zone 'Asia/Kolkata')::date";
  await exec(`insert into page_views (day, path, source, campaign, device, visitor_id, created_at) values
    (${today}, '/', 'direct', null, 'mobile', 'v1', now()),
    (${today}, '/register', 'direct', null, 'mobile', 'v1', now()),
    (${today}, '/pricing', 'linkedin.com', 'linkedin.emd', 'desktop', 'v2', now()),
    (${today} - 1, '/', 'google.com', null, 'desktop', 'v3', now() - interval '1 day'),
    (${today} - 10, '/', 'direct', null, 'desktop', 'v4', now() - interval '10 days')`);
  return { founder, alpha, beta, demo };
}

test('insights() counts (repo level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  await t.test('an empty database gives zeros, not errors', async () => {
    const r = await insights(db, { days: 7, adminEmails: [FOUNDER] });
    assert.equal(r.days, 7);
    assert.equal(r.series.length, 7);
    assert.deepEqual(r.totals.current, { visitors: 0, views: 0, signups: 0, uploads: 0, analyses: 0, failed: 0, waiting: 0 });
    assert.equal(r.paid.companies, 0);
    assert.deepEqual(r.accounts, []);
  });

  await t.test('every number leaves the founder\'s accounts out', async () => {
    await seed(db);
    const r = await insights(db, { days: 7, adminEmails: [FOUNDER] });
    assert.equal(r.live.visitors_now, 2);
    assert.equal(r.live.visitors_today, 2);
    assert.deepEqual(r.totals.current, { visitors: 3, views: 4, signups: 1, uploads: 2, analyses: 1, failed: 1, waiting: 0 },
      'Alpha only: the founder (Skylark) and the UNLIMITED Demo company are left out; Beta signed up 10 days ago');
    assert.equal(r.totals.previous.visitors, 1);
    assert.equal(r.totals.previous.signups, 1, 'Beta is in the period before');
    assert.deepEqual(r.funnel, { visitors: 3, saw_signup: 1, signups: 1, uploaded: 1, analysed: 1 });
    assert.deepEqual(r.paid, { companies: 1, monthlyListPrice: 3999, byPlan: [{ plan: 'Starter', companies: 1 }] });
    assert.deepEqual(r.campaigns, [{ label: 'linkedin.emd', visitors: 1 }]);
    const todayRow = r.series.at(-1);
    assert.deepEqual([todayRow.visitors, todayRow.signups, todayRow.uploads, todayRow.analyses], [2, 1, 2, 1]);

    const byName = Object.fromEntries(r.accounts.map((a) => [a.name, a]));
    assert.equal(byName.Skylark.internal, true);
    assert.equal(byName.Demo.internal, true);
    assert.equal(byName['Alpha Bids'].internal, false);
    assert.deepEqual([byName['Alpha Bids'].uploads, byName['Alpha Bids'].analysed, byName['Alpha Bids'].failed], [2, 1, 1]);
    assert.equal(byName['Alpha Bids'].contact, 'a@alpha.example');
    assert.ok(Date.now() - Date.parse(byName['Beta Infra'].signedUpAt) > 9 * 86400e3, 'signed up = the owner\'s sign-up date, not the company row');
    assert.ok(r.activity.length <= 12);
    assert.equal(r.accounts.at(-1).internal, true, 'internal accounts are listed last');

    const kinds = r.activity.map((a) => `${a.kind}:${a.company}`);
    assert.ok(kinds.includes('signup:Alpha Bids') && kinds.includes('analysed:Alpha Bids') && kinds.includes('failed:Alpha Bids'));
    assert.ok(!kinds.some((k) => k.endsWith(':Skylark') || k.endsWith(':Demo')), 'no founder activity in the feed');
  });

  await t.test('an unknown range falls back to 30 days', async () => {
    assert.equal((await insights(db, { days: 12, adminEmails: [] })).series.length, 30);
  });
});

test('GET /bidpilot/insights (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;
  const saved = config.bidpilot.adminEmails;

  t.before(async () => {
    config.bidpilot.adminEmails = [FOUNDER];
    setDb(new pg.Pool({ connectionString: DB_URL, max: 5 }));
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createInsightsRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    config.bidpilot.adminEmails = saved;
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    await closeTestDb();
  });

  let founderAuth;
  let customerAuth;
  t.beforeEach(async () => {
    await truncateAll();
    const { founder, alpha } = await seed(db);
    const mint = async (userId) => {
      const { rawToken, session } = await createSession(db, userId);
      return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    };
    founderAuth = await mint(founder.user.id);
    customerAuth = await mint(alpha.user.id);
  });

  function get(path, auth) {
    return new Promise((resolve, reject) => {
      const headers = auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}` } : {};
      http.get(`${baseUrl}${path}`, { headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, headers: res.headers });
        });
      }).on('error', reject);
    });
  }

  await t.test('needs a session', async () => {
    assert.equal((await get('/bidpilot/insights')).status, 401);
  });

  await t.test('a customer gets 404, and /me says they are not an admin', async () => {
    assert.equal((await get('/bidpilot/insights', customerAuth)).status, 404);
    assert.equal((await get('/bidpilot/me', customerAuth)).json.isAdmin, false);
  });

  await t.test('the founder gets the dashboard, never cached', async () => {
    const res = await get('/bidpilot/insights?days=7', founderAuth);
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.json.totals.current.signups, 1);
    assert.equal((await get('/bidpilot/me', founderAuth)).json.isAdmin, true);
  });
});
