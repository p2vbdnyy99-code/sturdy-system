// Runs via `node --test src/allowance.test.ts` (Node 22 type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowanceNotice } from './allowance.ts';

const END = new Date(2026, 10, 12, 10, 0).toISOString(); // 12 Nov 2026
const text = (n: ReturnType<typeof allowanceNotice>) => `${n.before}${n.bold}${n.after}`;

test('free trial with tenders left', () => {
  const n = allowanceNotice({ kind: 'trial', limit: 5, used: 2, remaining: 3 });
  assert.equal(text(n), 'Free trial: 3 of 5 tenders left to analyse.');
  assert.equal(n.tone, 'info');
  assert.equal(n.next, null);
  assert.equal(text(allowanceNotice({ kind: 'trial', limit: 5, used: 4, remaining: 1 })), 'Free trial: 1 of 5 tender left to analyse.');
});

test('free trial used up points to the monthly plans', () => {
  const n = allowanceNotice({ kind: 'trial', limit: 5, used: 5, remaining: 0 });
  assert.match(text(n), /^You’ve used all 5 free-trial tenders\. You can still open and re-run them\./);
  assert.equal(n.tone, 'warning');
  assert.equal(n.next, 'pricing');
});

test('monthly plan with tenders left shows the period end', () => {
  const n = allowanceNotice({ kind: 'plan', planName: 'Growth', periodEnd: END, limit: 15, used: 8, remaining: 7 });
  assert.equal(text(n), 'Growth plan: 7 of 15 tenders left this month (until 12 Nov 2026).');
  assert.equal(n.bold, '7 of 15');
});

test('monthly plan used up offers a bigger plan', () => {
  const n = allowanceNotice({ kind: 'plan', planName: 'Starter', periodEnd: END, limit: 10, used: 10, remaining: 0 });
  assert.equal(text(n), 'You’ve used all 10 tenders in your Starter plan until 12 Nov 2026. You can still open and re-run them. For more this month, move to a bigger plan.');
  assert.equal(n.next, 'bigger-plan');
});

test('an ended plan asks to renew', () => {
  const n = allowanceNotice({ kind: 'plan_expired', planName: 'Pro', periodEnd: END, limit: 0, used: 0, remaining: 0 });
  assert.equal(text(n), 'Your Pro plan ended on 12 Nov 2026. You can still open and re-run your tenders. To analyse new ones, renew your plan.');
  assert.equal(n.next, 'renew');
});
