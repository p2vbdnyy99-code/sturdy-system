#!/usr/bin/env node
// Tonight's numbers for the founder's nightly email, as one line of compact
// JSON: the same data as the live dashboard (src/bidpilot/insights.js) for the
// last 7 days, without any contact details. Read-only.
//
// Usage (on the server):  node scripts/insights-summary.mjs
//   fly ssh console --app tenderlytic-api -C "sh -c 'cd /app/backend && node scripts/insights-summary.mjs'"

import { getDb, closeDb } from '../src/db/client.js';
import { config } from '../src/config.js';
import { insights } from '../src/bidpilot/insights.js';

const r = await insights(getDb(), { days: 7, adminEmails: config.bidpilot.adminEmails });
await closeDb();

const today = r.series.at(-1) ?? { visitors: 0, views: 0, signups: 0, uploads: 0, analyses: 0 };
const summary = {
  date: today.day,
  today: { visitors: today.visitors, views: today.views, signups: today.signups, uploads: today.uploads, analyses: today.analyses },
  week: r.totals.current,
  previousWeek: r.totals.previous,
  series: r.series.map((d) => [d.day, d.visitors, d.signups, d.uploads, d.analyses]),
  funnel: r.funnel,
  paid: { companies: r.paid.companies, monthlyListPrice: r.paid.monthlyListPrice },
  sources: r.sources.slice(0, 4).map((s) => [s.label, s.visitors]),
  campaigns: r.campaigns.slice(0, 4).map((s) => [s.label, s.visitors]),
  activity: r.activity.slice(0, 6).map((a) => [a.kind, a.company, a.at]),
  stuck: r.accounts.filter((a) => !a.internal && (a.notAnalysed > 0 || a.failed > 0))
    .slice(0, 5).map((a) => [a.name, a.notAnalysed, a.failed]),
};
console.log(JSON.stringify(summary));
