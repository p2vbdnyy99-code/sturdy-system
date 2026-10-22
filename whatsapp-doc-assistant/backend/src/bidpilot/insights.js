// The founder's live dashboard (GET /bidpilot/insights): visits, sign-ups,
// uploads, analyses and plans, straight from the database. Read-only, and
// only for the accounts in config.bidpilot.adminEmails (isAdmin below).
//
// The founder's own accounts are left out of every customer number: a user
// whose email is an admin email, and any company on the internal UNLIMITED
// plan, is "internal". Their companies are listed separately so nothing
// disappears silently. Page views can't be told apart (they carry no user),
// so visits may include the founder's own.
//
// Days are India dates, as in scripts/visits-report.mjs: "visitors" adds up
// each day's unique visitors (visitor ids change every day).

import { PLANS, UNLIMITED_PLAN } from './plans.js';
import { getAllowance } from './analysis/budget.js';

/** Whether a signed-in user may see the dashboard. Email sign-up is not
 *  verified, so the list must only hold emails of accounts that already
 *  exist (an existing email can't be registered again). */
export function isAdmin(user, adminEmails) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(email) && (adminEmails || []).some((a) => String(a).trim().toLowerCase() === email);
}

export const RANGES = [7, 30, 90];
export const LIVE_MINUTES = 5;

const TODAY = "(now() at time zone 'Asia/Kolkata')::date";
// $1 = days, $2 = admin emails (lower case)
const SINCE = `${TODAY} - ($1::int - 1)`;
const PREV_SINCE = `${TODAY} - (2 * $1::int - 1)`;
const ist = (col) => `(${col} at time zone 'Asia/Kolkata')::date`;

// Companies that belong to the founder: a member with an admin email, or an
// internal UNLIMITED plan on the latest subscription row.
const internalCte = (n) => `
  internal as (
    select distinct m.company_id id from company_members m join users u on u.id = m.user_id
      where lower(u.email) = any($${n}::text[])
    union
    select s.company_id from (
      select distinct on (company_id) company_id, plan from subscriptions order by company_id, created_at desc
    ) s where s.plan = '${UNLIMITED_PLAN}'
  ),
  internal_users as (
    select u.id from users u where lower(u.email) = any($${n}::text[])
    union
    select m.user_id from company_members m where m.company_id in (select id from internal)
  )`;

async function rows(client, text, params) {
  return (await client.query(text, params)).rows;
}

/** Everything the dashboard shows, for the last `days` India days. */
export async function insights(db, { days = 30, adminEmails = [] } = {}) {
  const client = db.$client;
  const d = RANGES.includes(Number(days)) ? Number(days) : 30;
  const emails = adminEmails.map((e) => String(e).trim().toLowerCase());
  const p = [d, emails];
  const INTERNAL2 = internalCte(2);
  const run = (text) => rows(client, text, p);

  const [live] = await rows(client, `
    select
      (select count(distinct visitor_id)::int from page_views where created_at >= now() - interval '${LIVE_MINUTES} minutes') visitors_now,
      (select count(*)::int from page_views where created_at >= now() - interval '${LIVE_MINUTES} minutes') views_now,
      (select count(distinct visitor_id)::int from page_views where day = ${TODAY}) visitors_today,
      (select count(*)::int from page_views where day = ${TODAY}) views_today,
      (select max(created_at) from page_views) last_view_at`, []);

  // One row per day: visitors, views, sign-ups, uploads, analyses.
  const series = await run(`
    with ${INTERNAL2},
    days as (select generate_series(${SINCE}, ${TODAY}, interval '1 day')::date as day),
    v as (select day, count(distinct visitor_id)::int visitors, count(*)::int views
          from page_views where day >= ${SINCE} group by day),
    s as (select ${ist('created_at')} as day, count(*)::int signups from users
          where created_at >= (${SINCE})::timestamp at time zone 'Asia/Kolkata'
            and id not in (select id from internal_users) group by 1),
    up as (select ${ist('created_at')} as day, count(*)::int uploads from tenders
           where source = 'upload' and created_at >= (${SINCE})::timestamp at time zone 'Asia/Kolkata'
             and company_id not in (select id from internal) group by 1),
    an as (select ${ist('analyzed_at')} as day, count(*)::int analyses from tenders
           where analysis_status = 'COMPLETED' and analyzed_at >= (${SINCE})::timestamp at time zone 'Asia/Kolkata'
             and company_id not in (select id from internal) group by 1)
    select to_char(days.day, 'YYYY-MM-DD') as day,
      coalesce(v.visitors, 0) visitors, coalesce(v.views, 0) views, coalesce(s.signups, 0) signups,
      coalesce(up.uploads, 0) uploads, coalesce(an.analyses, 0) analyses
    from days left join v using (day) left join s using (day) left join up using (day) left join an using (day)
    order by days.day`);

  // The same totals for this period and the one before it (for the deltas).
  const periodTotals = (from, to) => `
    select
      (select coalesce(sum(n), 0)::int from (select count(distinct visitor_id) n from page_views
         where day between ${from} and ${to} group by day) x) visitors,
      (select count(*)::int from page_views where day between ${from} and ${to}) views,
      (select count(*)::int from users where ${ist('created_at')} between ${from} and ${to}
         and id not in (select id from internal_users)) signups,
      (select count(*)::int from tenders where source = 'upload' and ${ist('created_at')} between ${from} and ${to}
         and company_id not in (select id from internal)) uploads,
      (select count(*)::int from tenders where analysis_status = 'COMPLETED' and ${ist('analyzed_at')} between ${from} and ${to}
         and company_id not in (select id from internal)) analyses`;
  const [current] = await run(`with ${INTERNAL2} ${periodTotals(SINCE, TODAY)}`);
  const [previous] = await run(`with ${INTERNAL2} ${periodTotals(PREV_SINCE, `${SINCE} - 1`)}`);

  // Uploads in this period that are stuck or failed (the activation gap).
  const [uploadState] = await run(`
    with ${INTERNAL2}
    select
      count(*) filter (where analysis_status = 'FAILED')::int failed,
      count(*) filter (where analysis_status = 'NOT_STARTED'
        and exists (select 1 from tender_documents doc where doc.tender_id = t.id))::int waiting
    from tenders t
    where source = 'upload' and ${ist('created_at')} >= ${SINCE} and company_id not in (select id from internal)`);

  const [funnel] = await run(`
    with ${INTERNAL2}
    select
      (select count(distinct (day, visitor_id))::int from page_views where day >= ${SINCE}) visitors,
      (select count(distinct (day, visitor_id))::int from page_views where day >= ${SINCE} and path = '/register') saw_signup,
      (select count(*)::int from users where ${ist('created_at')} >= ${SINCE} and id not in (select id from internal_users)) signups,
      (select count(distinct company_id)::int from tenders where source = 'upload' and ${ist('created_at')} >= ${SINCE}
         and company_id not in (select id from internal)) uploaded,
      (select count(distinct company_id)::int from tenders where analysis_status = 'COMPLETED' and ${ist('analyzed_at')} >= ${SINCE}
         and company_id not in (select id from internal)) analysed`);

  const top = (col, limit, extra = '') => rows(client, `
    select ${col} label, count(distinct (day, visitor_id))::int visitors
    from page_views where day >= ${SINCE} ${extra} group by 1 order by visitors desc, label limit ${limit}`, [d]);
  const sources = await top('source', 8);
  const campaigns = await top('campaign', 10, 'and campaign is not null');
  const pages = await top('path', 10);
  const devices = await top('device', 3);

  // Latest subscription per company; a sold plan whose period includes now.
  const paidRows = await rows(client, `
    with ${internalCte(1)},
    latest as (select distinct on (company_id) company_id, plan, status, period_end from subscriptions
               order by company_id, created_at desc)
    select l.plan, count(*)::int companies from latest l
    where l.status = 'ACTIVE' and l.plan = any($2::text[]) and (l.period_end is null or l.period_end > now())
      and l.company_id not in (select id from internal)
    group by l.plan`, [emails, Object.keys(PLANS)]);
  const paid = {
    companies: paidRows.reduce((n, r) => n + r.companies, 0),
    monthlyListPrice: paidRows.reduce((n, r) => n + r.companies * PLANS[r.plan].pricePerMonth, 0),
    byPlan: paidRows.map((r) => ({ plan: PLANS[r.plan].name, companies: r.companies })),
  };

  // What happened lately, newest first (always the last 30 days).
  const activity = await rows(client, `
    with ${internalCte(1)},
    company_of as (select distinct on (m.user_id) m.user_id, c.name from company_members m
                   join companies c on c.id = m.company_id order by m.user_id, m.created_at)
    select * from (
      select 'signup' kind, u.created_at at, coalesce(co.name, '(no company yet)') company
        from users u left join company_of co on co.user_id = u.id
        where u.created_at >= now() - interval '30 days' and u.id not in (select id from internal_users)
      union all
      select 'upload', t.created_at, c.name from tenders t join companies c on c.id = t.company_id
        where t.source = 'upload' and t.created_at >= now() - interval '30 days' and t.company_id not in (select id from internal)
      union all
      select 'analysed', t.analyzed_at, c.name from tenders t join companies c on c.id = t.company_id
        where t.analysis_status = 'COMPLETED' and t.analyzed_at >= now() - interval '30 days' and t.company_id not in (select id from internal)
      union all
      select 'failed', t.updated_at, c.name from tenders t join companies c on c.id = t.company_id
        where t.analysis_status = 'FAILED' and t.updated_at >= now() - interval '30 days' and t.company_id not in (select id from internal)
    ) a order by at desc limit 12`, [emails]);

  // Every company, with what it has done (internal ones flagged).
  const companies = await rows(client, `
    with ${internalCte(1)},
    owner as (select distinct on (m.company_id) m.company_id, u.email, u.phone, u.created_at signed_up from company_members m
              join users u on u.id = m.user_id order by m.company_id, m.created_at)
    select c.id, c.name, coalesce(o.signed_up, c.created_at) signed_up, o.email, o.phone,
      c.id in (select id from internal) internal,
      count(t.id) filter (where t.source = 'upload')::int uploads,
      count(t.id) filter (where t.analysis_status = 'COMPLETED')::int analysed,
      count(t.id) filter (where t.analysis_status = 'FAILED')::int failed,
      count(t.id) filter (where t.analysis_status = 'NOT_STARTED' and t.source = 'upload')::int not_analysed,
      greatest(c.created_at, max(t.created_at), max(t.analyzed_at)) last_activity,
      exists (select 1 from company_profiles cp where cp.company_id = c.id) has_profile
    from companies c left join owner o on o.company_id = c.id left join tenders t on t.company_id = c.id
    group by c.id, c.name, c.created_at, o.signed_up, o.email, o.phone
    order by internal, last_activity desc nulls last`, [emails]);
  for (const c of companies) c.allowance = await getAllowance(db, c.id);

  return {
    days: d,
    generatedAt: new Date().toISOString(),
    live: { ...live, minutes: LIVE_MINUTES },
    totals: { current: { ...current, ...uploadState }, previous },
    series,
    funnel,
    paid,
    sources, campaigns, pages, devices,
    activity,
    accounts: companies.map((c) => ({
      id: c.id, name: c.name, signedUpAt: c.signed_up, contact: c.email ?? c.phone ?? null, internal: c.internal,
      uploads: c.uploads, analysed: c.analysed, failed: c.failed, notAnalysed: c.not_analysed,
      lastActivity: c.last_activity, hasProfile: c.has_profile, allowance: c.allowance,
    })),
  };
}
