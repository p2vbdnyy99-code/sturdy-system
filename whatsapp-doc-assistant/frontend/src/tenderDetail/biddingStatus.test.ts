import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biddingStatus } from './biddingStatus.ts';

const now = new Date(2026, 9, 15, 10, 0);
const day = (n: number) => new Date(2026, 9, 15 + n, 15, 0).toISOString();

test('bidding status from the deadline', () => {
  assert.equal(biddingStatus(null, now), null);
  assert.deepEqual(biddingStatus(day(-1), now), { label: 'Bidding closed', tone: 'closed' });
  assert.equal(biddingStatus(day(0), now)?.label, 'Bidding closes today');
  assert.equal(biddingStatus(day(1), now)?.label, 'Bidding open · 1 day left');
  assert.equal(biddingStatus(day(3), now)?.tone, 'soon');
  assert.deepEqual(biddingStatus(day(10), now), { label: 'Bidding open', tone: 'open' });
});
