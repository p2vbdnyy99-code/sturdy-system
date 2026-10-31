// The plan catalogue, and that the Pricing page shows the same numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANS, planFor, addMonths, UNLIMITED_PLAN } from '../../src/bidpilot/plans.js';

test('the three monthly plans', () => {
  assert.deepEqual(
    Object.entries(PLANS).map(([slug, p]) => [slug, p.name, p.pricePerMonth, p.tendersPerMonth]),
    [['STARTER', 'Starter', 3999, 10], ['GROWTH', 'Growth', 5999, 15], ['PRO', 'Pro', 8999, 30]],
  );
  assert.equal(planFor('growth').tendersPerMonth, 15);
  assert.equal(planFor(UNLIMITED_PLAN), null, 'UNLIMITED is not a sold plan');
  assert.equal(planFor('FREE'), null);
  assert.equal(planFor('toString'), null);
  assert.equal(planFor(undefined), null);
});

test('the Pricing page (frontend/src/config/site.ts) shows exactly these plans', () => {
  const site = fs.readFileSync(new URL('../../../frontend/src/config/site.ts', import.meta.url), 'utf8');
  const shown = [...site.matchAll(/name: '(\w+)', pricePerMonth: (\d+), tendersPerMonth: (\d+)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(shown, Object.values(PLANS).map((p) => [p.name, p.pricePerMonth, p.tendersPerMonth]));
});

test('a monthly period ends on the same day next month, or the month end', () => {
  assert.equal(addMonths(new Date('2026-10-12T05:00:00Z'), 1).toISOString(), '2026-11-12T05:00:00.000Z');
  assert.equal(addMonths(new Date('2026-01-31T05:00:00Z'), 1).toISOString(), '2026-02-28T05:00:00.000Z');
  assert.equal(addMonths(new Date('2026-12-15T05:00:00Z'), 1).toISOString(), '2027-01-15T05:00:00.000Z');
  assert.equal(addMonths(new Date('2026-10-12T05:00:00Z'), 3).toISOString(), '2027-01-12T05:00:00.000Z');
});
