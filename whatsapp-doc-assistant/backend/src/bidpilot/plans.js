// Monthly subscription plans. The public Pricing page shows the same numbers
// from frontend/src/config/site.ts; test/bidpilot/plans.test.js fails if the
// two ever differ.
//
// A company is on a plan when its latest `subscriptions` row is ACTIVE, names
// one of these plans, and has a period that includes today (see
// analysis/budget.js). Until online payment exists, rows are written with
// scripts/subscription.mjs. UNLIMITED is internal only (the founder's demo
// account) and is never shown on the site.

export const PLANS = Object.freeze({
  STARTER: Object.freeze({ name: 'Starter', pricePerMonth: 3999, tendersPerMonth: 10 }),
  GROWTH: Object.freeze({ name: 'Growth', pricePerMonth: 5999, tendersPerMonth: 15 }),
  PRO: Object.freeze({ name: 'Pro', pricePerMonth: 8999, tendersPerMonth: 30 }),
});

export const UNLIMITED_PLAN = 'UNLIMITED';

/** The plan for a stored slug, or null if it isn't a sold plan. */
export function planFor(slug) {
  return Object.hasOwn(PLANS, String(slug || '').toUpperCase()) ? PLANS[String(slug).toUpperCase()] : null;
}

/** Same day next month (or the month's last day if shorter), in UTC. */
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
