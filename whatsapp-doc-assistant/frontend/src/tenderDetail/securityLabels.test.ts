import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysToDate, expiryLabel, rupees } from './securityLabels.ts';

test('rupees use Indian grouping', () => {
  assert.equal(rupees(127300), '₹1,27,300');
  assert.equal(rupees(2500000.5), '₹25,00,000.5');
});

test('expiry is counted in India days', () => {
  // 20:00 UTC on 15 Oct is already 16 Oct in India.
  const now = new Date('2026-10-15T20:00:00Z');
  assert.equal(daysToDate('2026-10-16', now), 0);
  assert.equal(expiryLabel('2026-10-16', now), 'Expires today');
  assert.equal(expiryLabel('2026-10-17', now), 'Expires in 1 day');
  assert.equal(expiryLabel('2026-10-28', now), 'Expires in 12 days');
  assert.equal(expiryLabel('2026-10-13', now), 'Expired 3 days ago');
});
