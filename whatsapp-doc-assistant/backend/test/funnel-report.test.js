// funnelReport.js: entry → sign-up journeys and upload → analysis counts,
// against real Postgres (the queries are aggregate SQL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from './db/helpers.js';
import { pageViews } from '../src/db/schema/index.js';
import { createCompanyWithOwner } from '../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../src/bidpilot/repo/tenants.js';
import { createTender } from '../src/bidpilot/repo/tenders.js';
import { createTenderDocument } from '../src/bidpilot/repo/documents.js';
import { entryFunnel, activation } from '../src/bidpilot/funnelReport.js';
import { istDay } from '../src/bidpilot/visits.js';

const SKIP = dbAvailable() ? false : 'DATABASE_URL not set — see test/db/helpers.js';

test('funnel report', { skip: SKIP }, async (t) => {
  const db = testDb();
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  t.after(async () => { await client.end(); await closeTestDb(); });
  t.beforeEach(truncateAll);

  const today = istDay();
  const at = (s) => new Date(Date.now() - 3_600_000 + s * 1000); // an hour ago, plus s seconds
  const view = (visitorId, path, s, source = 'direct', campaign = null) => ({
    day: today, path, source, campaign, device: 'desktop', visitorId, createdAt: at(s),
  });

  await t.test('journeys are grouped by their entry and counted by how far they got', async () => {
    await db.insert(pageViews).values([
      // A LinkedIn post visitor who registers and creates a company.
      view('v1', '/government-tenders/state/goa', 0, 'linkedin.com', 'linkedin.emd_exemption'),
      view('v1', '/register', 10, 'linkedin.com', 'linkedin.emd_exemption'),
      view('v1', '/signed-up', 20, 'linkedin.com', 'linkedin.emd_exemption'),
      view('v1', '/dashboard', 30, 'linkedin.com', 'linkedin.emd_exemption'),
      // Another visitor from the same post who only looks.
      view('v2', '/government-tenders/state/goa', 5, 'linkedin.com', 'linkedin.emd_exemption'),
      // A returning user signing in directly.
      view('v3', '/login', 0), view('v3', '/dashboard', 15), view('v3', '/tenders/:id', 25),
      // A Google visitor who reaches /register but stops.
      view('v4', '/', 0, 'google.com'), view('v4', '/register', 40, 'google.com'),
    ]);
    const rows = await entryFunnel(client, 7);
    const by = (entry, source) => rows.find((r) => r.entry === entry && r.source === source);
    assert.deepEqual(
      { ...by('/government-tenders/state/goa', 'linkedin.com') },
      { source: 'linkedin.com', campaign: 'linkedin.emd_exemption', entry: '/government-tenders/state/goa',
        journeys: 2, saw_register: 1, new_accounts: 1, reached_app: 1 },
    );
    assert.equal(by('/login', 'direct').new_accounts, 0, 'a returning user is not a new account');
    assert.equal(by('/login', 'direct').reached_app, 1);
    assert.equal(by('/', 'google.com').saw_register, 1);
    assert.equal(rows[0].new_accounts, 1, 'entries that produced accounts come first');
  });

  await t.test('a journey through the old onboarding page still counts as a new account', async () => {
    await db.insert(pageViews).values([
      view('v5', '/register', 0, 'google.com'), view('v5', '/onboarding/create-company', 10, 'google.com'),
    ]);
    const [row] = await entryFunnel(client, 7);
    assert.equal(row.new_accounts, 1);
  });

  await t.test('older days are outside the window', async () => {
    const old = new Date(Date.now() - 20 * 86_400_000);
    const oldDay = istDay(old.getTime());
    await db.insert(pageViews).values({ ...view('v9', '/register', 0), day: oldDay, createdAt: old });
    assert.deepEqual(await entryFunnel(client, 7), []);
    assert.equal((await entryFunnel(client, 30)).length, 1);
  });

  await t.test('activation counts uploads that reached an analysis and ones waiting for the click', async () => {
    const { user, company } = await createCompanyWithOwner(db, { companyName: 'Act Co', userEmail: 'a@example.com', userName: 'A' });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const pdf = { filename: 't.pdf', storagePath: 'k', mimeType: 'application/pdf', sizeBytes: 1 };
    const quick = await createTender(scope, { title: 'Analysed the same day' });
    const waiting = await createTender(scope, { title: 'Waiting for Analyze' });
    const late = await createTender(scope, { title: 'Analysed two days later' });
    const feed = await createTender(scope, { title: 'Tracked', source: 'feed' });
    for (const tender of [quick, waiting, late]) await createTenderDocument(scope, tender.id, pdf);
    await client.query("update tenders set analysis_status = 'COMPLETED', analyzed_at = created_at + interval '1 hour' where id = $1", [quick.id]);
    await client.query("update tenders set analysis_status = 'COMPLETED', analyzed_at = created_at + interval '2 days' where id = $1", [late.id]);
    await client.query("update tenders set processing_status = 'COMPLETED' where id = $1", [feed.id]);

    assert.deepEqual({ ...(await activation(client, 7)) }, {
      uploaded: 3, uploaded_analysed: 2, analysed_within_24h: 1, waiting_for_analyze: 1, failed: 0,
      tracked_from_feed: 1, feed_with_pdf: 0, feed_analysed: 0,
    });
  });
});
