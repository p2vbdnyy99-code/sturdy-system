// The tender-count cache (repo/publicTenders.js cachedFacets): the counts
// query takes seconds in production, so once loaded no request may wait for
// it, and every caller shares one copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedFacets } from '../../src/bidpilot/repo/publicTenders.js';

function fakeLoader() {
  const calls = [];
  const load = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
  return { load, calls };
}

test('the first load is waited for, once, however many callers ask', async () => {
  const { load, calls } = fakeLoader();
  const cache = { value: null, at: 0, pending: null };
  const a = cachedFacets(60_000, load, cache);
  const b = cachedFacets(60_000, load, cache);
  const first = Promise.all([a('db'), b('db')]);
  assert.equal(calls.length, 1, 'one query for both callers');
  calls[0].resolve({ v: 1 });
  assert.deepEqual(await first, [{ v: 1 }, { v: 1 }]);
  assert.deepEqual(await a('db'), { v: 1 });
  assert.equal(calls.length, 1, 'fresh copy served without a query');
});

test('a stale copy is served at once while one refresh runs; a failed refresh keeps it', async () => {
  const { load, calls } = fakeLoader();
  const cache = { value: { v: 1 }, at: Date.now() - 10_000, pending: null };
  const get = cachedFacets(1_000, load, cache);
  assert.deepEqual(await get('db'), { v: 1 }, 'no waiting for the refresh');
  assert.deepEqual(await get('db'), { v: 1 });
  assert.equal(calls.length, 1, 'only one refresh at a time');
  calls[0].reject(new Error('database busy'));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await get('db'), { v: 1 }, 'still the last good copy');
  assert.equal(calls.length, 2, 'tries again on the next request');
  calls[1].resolve({ v: 2 });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await get('db'), { v: 2 }, 'the new copy once it arrives');
});
