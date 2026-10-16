#!/usr/bin/env node
// Start, renew and end a company's monthly subscription by hand, until online
// payment is connected. Run on the server (see OPERATIONS.md):
//
//   node scripts/subscription.mjs status                       every company: plan, period, tenders used
//   node scripts/subscription.mjs activate <companyId> <PLAN> [months]
//        starts PLAN now for [months] (default 1), replacing any current period
//   node scripts/subscription.mjs renew <companyId> [months]
//        same plan again, starting when the current period ends (or now if it already has)
//   node scripts/subscription.mjs cancel <companyId>
//        back to the free trial from now
//
// PLAN is STARTER, GROWTH or PRO (backend/src/bidpilot/plans.js), or UNLIMITED
// for internal accounts. Every change adds a subscriptions row (the latest
// row wins), so the history is kept. Only run activate/renew/cancel after the
// payment has been received or the user asked for it.

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq } from 'drizzle-orm';
import * as schema from '../src/db/schema/index.js';
import { PLANS, UNLIMITED_PLAN, planFor, addMonths } from '../src/bidpilot/plans.js';
import { getAllowance, getEntitlement } from '../src/bidpilot/analysis/budget.js';

const [command = 'status', companyId, ...rest] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
const { companies, subscriptions } = schema;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');
const fail = async (msg) => { console.error(msg); await pool.end(); process.exit(1); };

async function companyOrFail(id) {
  if (!id) await fail('Give the company id (see `status`).');
  const [row] = await db.select().from(companies).where(eq(companies.id, id)).catch(() => []);
  if (!row) await fail(`No company with id ${id}.`);
  return row;
}

async function describe(company) {
  const a = await getAllowance(db, company.id);
  const what = !a ? 'unlimited'
    : a.kind === 'trial' ? `free trial, ${a.used}/${a.limit} used`
      : a.kind === 'plan' ? `${a.planName}, ${a.used}/${a.limit} used, period ends ${day(a.periodEnd)}`
        : `${a.planName} ended ${day(a.periodEnd)}`;
  return `${company.id}  ${company.name}: ${what}`;
}

if (command === 'status') {
  for (const company of await db.select().from(companies)) console.log(await describe(company));
} else if (command === 'activate') {
  const company = await companyOrFail(companyId);
  const slug = String(rest[0] || '').toUpperCase();
  if (slug !== UNLIMITED_PLAN && !planFor(slug)) await fail(`Plan must be one of ${Object.keys(PLANS).join(', ')} or ${UNLIMITED_PLAN}.`);
  const months = Math.max(1, Number(rest[1]) || 1);
  const start = new Date();
  await db.insert(subscriptions).values({
    companyId: company.id, plan: slug, status: 'ACTIVE',
    periodStart: slug === UNLIMITED_PLAN ? null : start,
    periodEnd: slug === UNLIMITED_PLAN ? null : addMonths(start, months),
  });
  console.log(`Activated. ${await describe(company)}`);
} else if (command === 'renew') {
  const company = await companyOrFail(companyId);
  const ent = await getEntitlement(db, company.id);
  const [current] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, company.id))
    .orderBy(desc(subscriptions.createdAt)).limit(1);
  if (!current || current.status !== 'ACTIVE' || !planFor(current.plan)) await fail('No monthly plan to renew. Use activate.');
  const months = Math.max(1, Number(rest[0]) || 1);
  const start = ent.kind === 'plan' ? ent.periodEnd : new Date();
  await db.insert(subscriptions).values({
    companyId: company.id, plan: current.plan, status: 'ACTIVE', periodStart: start, periodEnd: addMonths(start, months),
  });
  console.log(`Renewed ${planFor(current.plan).name} from ${day(start)} to ${day(addMonths(start, months))}. ${await describe(company)}`);
} else if (command === 'cancel') {
  const company = await companyOrFail(companyId);
  await db.insert(subscriptions).values({ companyId: company.id, plan: 'FREE', status: 'CANCELED' });
  console.log(`Cancelled. ${await describe(company)}`);
} else {
  await fail('Commands: status | activate <companyId> <PLAN> [months] | renew <companyId> [months] | cancel <companyId>');
}
await pool.end();
