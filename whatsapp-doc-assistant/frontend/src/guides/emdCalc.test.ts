// Runs via `node --test src/guides/emdCalc.test.ts` (Node 22 type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, parseRupees, percentOf } from './emdCalc.ts';

test('reads amounts as people type them', () => {
  assert.equal(parseRupees('40,35,586.00'), 4035586);
  assert.equal(parseRupees('Rs. 5 00 000'), 500000);
  assert.equal(parseRupees('₹2500000'), 2500000);
  for (const bad of ['', 'abc', '0', '-5', '1e5']) assert.equal(parseRupees(bad), null, bad);
});

test('works out the AIIMS example in the EMD guide: 2% of Rs. 40,35,586.00', () => {
  assert.equal(formatRupees(percentOf(4035586, 2)), '80,711.72');
});

test('rounds to the paisa and groups digits the Indian way', () => {
  assert.equal(formatRupees(percentOf(1000000, 2)), '20,000.00');
  assert.equal(formatRupees(percentOf(12345678, 2.5)), '3,08,641.95');
  assert.equal(formatRupees(percentOf(333, 3)), '9.99');
});
