#!/usr/bin/env node
// TenderTez visits and sign-ups for the last N days (default 7), from the
// database: visitors, pages, where visits came from, then sign-ups, tenders
// uploaded and tenders analysed in the same days. Read-only.
//
// Usage (on the server):  node scripts/visits-report.mjs [days]
//   fly ssh console --app tenderlytic-api -C "sh -c 'cd /app/backend && node scripts/visits-report.mjs 7'"
//
// Days are India dates. "Visitors" adds up each day's unique visitors, so
// someone who came on two days counts twice (visitor ids change every day).
// A visitor who arrived once from LinkedIn and once directly shows under both
// sources, so the sources can add up to more than the visitor total.

import pg from 'pg';

const days = Math.max(1, Math.min(400, Number(process.argv[2]) || 7));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (sql) => (await client.query(sql, [days])).rows;
const since = "(now() at time zone 'Asia/Kolkata')::date - ($1::int - 1)";
const sinceTs = `(${since})::timestamp at time zone 'Asia/Kolkata'`;

const perDay = await q(`
  select to_char(day, 'DD Mon') d, count(distinct visitor_id)::int visitors, count(*)::int views
  from page_views where day >= ${since} group by day order by day`);
const pages = await q(`
  select path, count(*)::int views, count(distinct (day, visitor_id))::int visitors
  from page_views where day >= ${since} group by path order by views desc limit 15`);
const sources = await q(`
  select source, count(distinct (day, visitor_id))::int visitors
  from page_views where day >= ${since} group by source order by visitors desc limit 15`);
const campaigns = await q(`
  select campaign, count(distinct (day, visitor_id))::int visitors
  from page_views where day >= ${since} and campaign is not null group by campaign order by visitors desc`);
const devices = await q(`
  select device, count(distinct (day, visitor_id))::int visitors
  from page_views where day >= ${since} group by device order by visitors desc`);
const [funnel] = await q(`
  select
    (select count(distinct (day, visitor_id))::int from page_views where day >= ${since}) visitors,
    (select count(distinct (day, visitor_id))::int from page_views where day >= ${since} and path = '/register') saw_signup,
    (select count(*)::int from users where created_at >= ${sinceTs}) signups,
    (select count(*)::int from tenders where created_at >= ${sinceTs}) uploaded,
    (select count(*)::int from tenders where created_at >= ${sinceTs} and analysis_status = 'COMPLETED') analysed`);
await client.end();

const table = (rows) => (rows.length ? console.table(rows) : console.log('  (none)'));
console.log(`\nTenderTez, last ${days} day(s), India time\n`);
console.log('Funnel');
console.log(`  Visitors ${funnel.visitors} → saw sign-up page ${funnel.saw_signup} → signed up ${funnel.signups}`
  + ` → tenders uploaded ${funnel.uploaded} → analysed ${funnel.analysed}`);
console.log('\nVisitors per day'); table(perDay);
console.log('\nPages'); table(pages);
console.log('\nWhere visits came from'); table(sources);
console.log('\nCampaigns (utm_source)'); table(campaigns);
console.log('\nDevices'); table(devices);
