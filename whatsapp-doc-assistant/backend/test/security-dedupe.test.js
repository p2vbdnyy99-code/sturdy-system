// Security: webhook de-duplication / replay protection.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicate, _reset } from '../src/dedupe.js';

beforeEach(() => _reset());

test('first sighting is not a duplicate; the second is', () => {
  assert.equal(isDuplicate('wamid.ABC'), false);
  assert.equal(isDuplicate('wamid.ABC'), true);
  assert.equal(isDuplicate('wamid.ABC'), true);
});

test('different ids are independent', () => {
  assert.equal(isDuplicate('wamid.A'), false);
  assert.equal(isDuplicate('wamid.B'), false);
  assert.equal(isDuplicate('wamid.A'), true);
});

test('a replayed signed request (same id) is caught as duplicate', () => {
  const id = 'wamid.REPLAY';
  assert.equal(isDuplicate(id), false); // legitimate delivery
  assert.equal(isDuplicate(id), true); // attacker replays the exact bytes
});

test('entries expire after the TTL window', () => {
  const now = 1_000_000;
  assert.equal(isDuplicate('wamid.T', { ttlMs: 1000, now }), false);
  assert.equal(isDuplicate('wamid.T', { ttlMs: 1000, now: now + 500 }), true);
  assert.equal(isDuplicate('wamid.T', { ttlMs: 1000, now: now + 2000 }), false); // expired
});

test('missing / non-string ids are never treated as duplicates (fail open)', () => {
  assert.equal(isDuplicate(undefined), false);
  assert.equal(isDuplicate(''), false);
  assert.equal(isDuplicate(undefined), false);
});
