// Security: per-sender rate limiting (abuse / cost protection).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { allow, _reset } from '../src/ratelimit.js';

beforeEach(() => _reset());

test('allows up to the limit, then blocks within the window', () => {
  const opts = { limit: 3, now: 5_000 };
  assert.equal(allow('user-a', opts), true);
  assert.equal(allow('user-a', opts), true);
  assert.equal(allow('user-a', opts), true);
  assert.equal(allow('user-a', opts), false); // 4th in the window
  assert.equal(allow('user-a', opts), false);
});

test('separate senders have independent budgets', () => {
  const opts = { limit: 1, now: 5_000 };
  assert.equal(allow('user-a', opts), true);
  assert.equal(allow('user-a', opts), false);
  assert.equal(allow('user-b', opts), true); // not affected by user-a
});

test('the window resets after 60s', () => {
  assert.equal(allow('u', { limit: 1, now: 0 }), true);
  assert.equal(allow('u', { limit: 1, now: 100 }), false);
  assert.equal(allow('u', { limit: 1, now: 61_000 }), true); // new window
});

test('missing key fails open (never blocks)', () => {
  assert.equal(allow('', { limit: 1 }), true);
  assert.equal(allow(undefined, { limit: 1 }), true);
});
