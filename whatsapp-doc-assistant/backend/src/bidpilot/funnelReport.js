// Which channels and pages lead to sign-ups and analyses, from data the site
// already records (page_views, tenders). Read-only; used by
// scripts/visits-report.mjs. No new data is collected for this.
//
// A journey is one visitor-day: page_views.visitor_id changes every day (see
// visits.js), so a visit on Monday and a sign-up on Tuesday can't be linked.
// Every view in a journey carries the referrer and utm_source of the page the
// visitor landed on (frontend api/visits.ts), and the journey's first view is
// its entry page. A journey that reaches /onboarding/create-company is a new
// account: CompanyGate sends a signed-in user without a company there, which
// in practice means someone who has just registered.

// $1 is the number of days, counting today (India dates), as in visits-report.
const SINCE_DAY = "(now() at time zone 'Asia/Kolkata')::date - ($1::int - 1)";
const SINCE_TS = `(${SINCE_DAY})::timestamp at time zone 'Asia/Kolkata'`;

/** Per entry (source, campaign, landing page): journeys and how far they got. */
export async function entryFunnel(client, days) {
  const { rows } = await client.query(`
    with v as (
      select day, visitor_id, source, campaign, path, created_at from page_views where day >= ${SINCE_DAY}
    ),
    journeys as (
      select day, visitor_id,
        (array_agg(source order by created_at))[1] source,
        (array_agg(coalesce(campaign, '') order by created_at))[1] campaign,
        (array_agg(path order by created_at))[1] entry,
        bool_or(path = '/register') saw_register,
        bool_or(path = '/onboarding/create-company') new_account,
        bool_or(path in ('/dashboard', '/tenders/:id')) in_app
      from v group by day, visitor_id
    )
    select source, campaign, entry,
      count(*)::int journeys,
      count(*) filter (where saw_register)::int saw_register,
      count(*) filter (where new_account)::int new_accounts,
      count(*) filter (where in_app)::int reached_app
    from journeys
    group by source, campaign, entry
    order by new_accounts desc, journeys desc, source, entry
    limit 25`, [days]);
  return rows;
}

/** Tenders added in the period: uploads, and how many reached an analysis. */
export async function activation(client, days) {
  const { rows: [row] } = await client.query(`
    with t as (
      select t.source, t.analysis_status, t.created_at, t.analyzed_at,
        exists (select 1 from tender_documents d where d.tender_id = t.id) has_pdf
      from tenders t where t.created_at >= ${SINCE_TS}
    )
    select
      count(*) filter (where source = 'upload')::int uploaded,
      count(*) filter (where source = 'upload' and analysis_status = 'COMPLETED')::int uploaded_analysed,
      count(*) filter (where source = 'upload' and analysis_status = 'COMPLETED'
        and analyzed_at <= created_at + interval '24 hours')::int analysed_within_24h,
      count(*) filter (where source = 'upload' and has_pdf and analysis_status = 'NOT_STARTED')::int waiting_for_analyze,
      count(*) filter (where source = 'upload' and analysis_status = 'FAILED')::int failed,
      count(*) filter (where source = 'feed')::int tracked_from_feed,
      count(*) filter (where source = 'feed' and has_pdf)::int feed_with_pdf,
      count(*) filter (where source = 'feed' and analysis_status = 'COMPLETED')::int feed_analysed
    from t`, [days]);
  return row;
}
