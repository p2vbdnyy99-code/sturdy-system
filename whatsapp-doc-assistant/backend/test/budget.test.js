// AI spend guard — the hard cap that keeps a beta from running up a bill.
// -----------------------------------------------------------------------------
// These assert the three caps (per-user/day, global/day, global/month), that a
// cap of 0 means unlimited, that windows roll over at UTC day/month boundaries,
// and — the one that actually protects money — that a DENIED call does not
// consume budget (so the ceiling is exact, not off-by-the-rejections).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeAiCall, budgetSnapshot, __resetBudget } from '../src/budget.js';

const AT = (iso) => new Date(iso);

test('per-user daily cap blocks the (N+1)th call for that user only', () => {
  __resetBudget();
  const b = { dailyAiCalls: 0, monthlyAiCalls: 0, perUserDailyAiCalls: 3 };
  const now = AT('2026-08-10T09:00:00Z');
  for (let i = 0; i < 3; i++) {
    assert.equal(consumeAiCall('alice', b, now).ok, true, `alice call ${i + 1} allowed`);
  }
  const denied = consumeAiCall('alice', b, now);
  assert.equal(denied.ok, false);
  assert.equal(denied.scope, 'user');
  // A different user is unaffected by alice's exhaustion.
  assert.equal(consumeAiCall('bob', b, now).ok, true, 'bob has his own allowance');
});

test('global daily cap blocks everyone once the day total is reached', () => {
  __resetBudget();
  const b = { dailyAiCalls: 2, monthlyAiCalls: 0, perUserDailyAiCalls: 0 };
  const now = AT('2026-08-10T10:00:00Z');
  assert.equal(consumeAiCall('u1', b, now).ok, true);
  assert.equal(consumeAiCall('u2', b, now).ok, true);
  const denied = consumeAiCall('u3', b, now);
  assert.equal(denied.ok, false);
  assert.equal(denied.scope, 'day');
});

test('global monthly cap blocks once the month total is reached', () => {
  __resetBudget();
  const b = { dailyAiCalls: 0, monthlyAiCalls: 2, perUserDailyAiCalls: 0 };
  // Two different days in the same month — daily window rolls, monthly doesn't.
  assert.equal(consumeAiCall('u', b, AT('2026-08-01T00:00:00Z')).ok, true);
  assert.equal(consumeAiCall('u', b, AT('2026-08-15T00:00:00Z')).ok, true);
  const denied = consumeAiCall('u', b, AT('2026-08-20T00:00:00Z'));
  assert.equal(denied.ok, false);
  assert.equal(denied.scope, 'month');
});

test('a denied call does NOT consume budget (the ceiling is exact)', () => {
  __resetBudget();
  const b = { dailyAiCalls: 1, monthlyAiCalls: 0, perUserDailyAiCalls: 0 };
  const now = AT('2026-08-10T11:00:00Z');
  assert.equal(consumeAiCall('u1', b, now).ok, true);
  // Ten rejected attempts...
  for (let i = 0; i < 10; i++) assert.equal(consumeAiCall('u2', b, now).ok, false);
  // ...leave the daily count at exactly the cap, not cap+10.
  assert.equal(budgetSnapshot().dayCount, 1);
});

test('cap of 0 means unlimited for that dimension', () => {
  __resetBudget();
  const b = { dailyAiCalls: 0, monthlyAiCalls: 0, perUserDailyAiCalls: 0 };
  const now = AT('2026-08-10T12:00:00Z');
  for (let i = 0; i < 1000; i++) {
    assert.equal(consumeAiCall('u', b, now).ok, true);
  }
});

test('the daily window (and per-user counts) reset at the UTC day boundary', () => {
  __resetBudget();
  const b = { dailyAiCalls: 1, monthlyAiCalls: 0, perUserDailyAiCalls: 1 };
  assert.equal(consumeAiCall('u', b, AT('2026-08-10T23:59:59Z')).ok, true);
  assert.equal(consumeAiCall('u', b, AT('2026-08-10T23:59:59Z')).ok, false, 'day is full');
  // Next UTC day → fresh allowance.
  assert.equal(consumeAiCall('u', b, AT('2026-08-11T00:00:01Z')).ok, true, 'new day resets');
});

test('snapshot reflects the counters after a mix of calls', () => {
  __resetBudget();
  const b = { dailyAiCalls: 0, monthlyAiCalls: 0, perUserDailyAiCalls: 0 };
  const now = AT('2026-08-10T13:00:00Z');
  consumeAiCall('a', b, now);
  consumeAiCall('a', b, now);
  consumeAiCall('c', b, now);
  const s = budgetSnapshot();
  assert.equal(s.dayCount, 3);
  assert.equal(s.monthCount, 3);
  assert.equal(s.usersToday, 2, 'two distinct users touched today');
});
