// The collector's upsert (discovery/collector.js storeRows) rewrites a row only
// when its details changed, so the table stays small and the search counts
// stay an index-only scan (repo/publicTenders.js feedFacets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeRows } from '../../src/bidpilot/discovery/collector.js';
import { dbAvailable, testDb, closeTestDb, truncateAll } from '../db/helpers.js';

const SKIP = !dbAvailable() && 'DATABASE_URL not set';

const row = (key, over = {}) => ({
  source: 'cppp', sourceKey: key, kind: 'state', title: `Road work ${key}`, reference: `REF/${key}`, tenderId: `2026_X_${key}_1`,
  organisation: 'PWD', department: null, state: 'Goa', category: null,
  publishedAt: new Date('2026-10-20T05:00:00Z'), closingAt: new Date('2026-11-05T09:30:00Z'), openingAt: null, url: null,
  ...over,
});

test('storeRows: new rows are added, unchanged rows are not rewritten, changed rows are', { skip: SKIP }, async (t) => {
  const db = testDb();
  t.after(async () => { await truncateAll(); await closeTestDb(); });
  await truncateAll();
  const versions = async () => Object.fromEntries((await db.execute(
    "select source_key, xmin::text as v, closing_at, last_seen_at from public_tenders order by source_key")).rows.map((r) => [r.source_key, r]));

  assert.equal(await storeRows(db, [row('a'), row('b')]), 2);
  const first = await versions();
  assert.deepEqual(Object.keys(first), ['a', 'b']);

  await storeRows(db, [row('a'), row('b')]);
  const same = await versions();
  assert.equal(same.a.v, first.a.v, 'an unchanged row is not rewritten');
  assert.equal(same.b.v, first.b.v);

  await storeRows(db, [row('a', { closingAt: new Date('2026-11-12T09:30:00Z') }), row('b'), row('c')]);
  const after = await versions();
  assert.notEqual(after.a.v, first.a.v, 'a changed closing date is saved');
  assert.equal(new Date(after.a.closing_at).toISOString(), '2026-11-12T09:30:00.000Z');
  assert.ok(new Date(after.a.last_seen_at) >= new Date(first.a.last_seen_at));
  assert.equal(after.b.v, first.b.v, 'the unchanged row still untouched');
  assert.ok(after.c, 'a new row is added');
});
