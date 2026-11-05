// Runs via `node --test src/tenders/freshness.test.ts` (Node 22 type stripping).
// What the tender lists say about their freshness (freshness.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWording, freshnessFor, freshnessView, homeBandView, type FeedFreshness } from './freshness.ts';

const at = (iso: string) => iso;
const feed = (central: string, state: string, gem: string, last: Record<string, string | null> = {}): FeedFreshness => ({
  checkedAt: '2026-11-05T06:00:00.000Z',
  status: 'fresh',
  sources: {
    central: { status: central as never, lastSuccessAt: last.central ?? at('2026-11-05T05:30:00.000Z') },
    state: { status: state as never, lastSuccessAt: last.state ?? at('2026-11-05T05:30:00.000Z') },
    gem: { status: gem as never, lastSuccessAt: last.gem ?? at('2026-11-05T05:30:00.000Z') },
  },
});

test('fresh: a quiet "Updated" line, and the count says "right now"', () => {
  const f = feed('fresh', 'fresh', 'fresh');
  const v = freshnessView(f, 'central');
  assert.equal(v?.tone, 'quiet');
  assert.match(v!.text, /^Updated 5 Nov, 11:00 am IST from CPPP\.$/i);
  assert.equal(countWording(f, 'central'), 'open tenders right now');
});

test('delayed: an info notice with the last update time', () => {
  const v = freshnessView(feed('delayed', 'fresh', 'fresh'), 'central');
  assert.equal(v?.tone, 'info');
  assert.match(v!.text, /^Last updated 5 Nov, 11:00 am IST\. The next update is late/i);
});

test('stale and unavailable: a warning with the last successful update date, never "right now"', () => {
  const last = { central: '2026-10-23T15:29:45.000Z', state: '2026-10-23T15:29:50.000Z', gem: '2026-10-23T15:29:38.000Z' };
  for (const status of ['stale', 'unavailable']) {
    const f = feed(status, status, status, last);
    const one = freshnessView(f, 'state');
    assert.equal(one?.tone, 'warning');
    assert.match(one!.text, /^This list has not been updated since 23 October 2026\. Tenders published since then are missing/);
    assert.equal(countWording(f, 'state'), 'open tenders in our last update (23 October 2026)');
    const all = freshnessView(f, null);
    assert.match(all!.text, /^Central government tenders, State tenders and GeM bids have not been updated since 23 October 2026/);
  }
});

test('all lists: the worst status wins, with the oldest successful update among those lists', () => {
  const f = feed('fresh', 'stale', 'unavailable', { gem: '2026-10-20T00:00:00.000Z' });
  const s = freshnessFor(f, null);
  assert.equal(s?.status, 'unavailable');
  assert.deepEqual(s?.lists, ['gem']);
  assert.match(freshnessView(f, null)!.text, /^GeM bids have not been updated since 20 October 2026/);
  assert.equal(freshnessView(f, 'central')?.tone, 'quiet', 'one fresh list stays quiet');
});

test('missing data: nothing to show, and the count keeps its old wording', () => {
  assert.equal(freshnessView(null, 'central'), null);
  assert.equal(freshnessView(undefined, null), null);
  assert.equal(countWording(null, null), 'open tenders right now');
  const never = feed('unavailable', 'unavailable', 'unavailable', {});
  for (const k of ['central', 'state', 'gem']) never.sources[k].lastSuccessAt = null;
  assert.match(freshnessView(never, 'gem')!.text, /^This list has not been updated recently\. Check the portal/);
  assert.equal(countWording(never, 'gem'), 'open tenders in our last update', 'never "right now" when not fresh');
});


test('home band: fresh, delayed or unknown keeps the usual "open" labels and no note', () => {
  for (const f of [feed('fresh', 'fresh', 'fresh'), feed('delayed', 'fresh', 'delayed'), null, undefined]) {
    const v = homeBandView(f);
    assert.deepEqual(v.labels, { central: 'open', state: 'open', gem: 'open' });
    assert.equal(v.note, null);
    assert.equal(v.anyOld, false);
  }
});

test('home band: all stale on the same day gives one date', () => {
  const day = { central: '2026-10-23T15:29:45.000Z', state: '2026-10-23T15:29:50.000Z', gem: '2026-10-23T15:29:38.000Z' };
  for (const status of ['stale', 'unavailable']) {
    const v = homeBandView(feed(status, status, status, day));
    assert.deepEqual(v.labels, { central: 'open in our last update', state: 'open in our last update', gem: 'open in our last update' });
    assert.equal(v.note, 'Last updated 23 October 2026. New tenders published since then are missing.');
    assert.equal(v.anyOld, true);
  }
});

test('home band: different dates are each named, never one common date', () => {
  const v = homeBandView(feed('stale', 'unavailable', 'stale', {
    central: '2026-10-23T15:29:45.000Z', state: '2026-10-20T10:00:00.000Z', gem: '2026-10-24T08:00:00.000Z',
  }));
  assert.equal(v.note, 'Last updated: Central government 23 October 2026, State portals 20 October 2026, GeM bids 24 October 2026. '
    + 'Newer tenders in those lists are missing.');
});

test('home band: only one list stale changes only its label and names only it', () => {
  const v = homeBandView(feed('fresh', 'fresh', 'stale', { gem: '2026-11-02T06:00:00.000Z' }));
  assert.deepEqual(v.labels, { central: 'open', state: 'open', gem: 'open in our last update' });
  assert.equal(v.note, 'Last updated: GeM bids 2 November 2026. Newer tenders in that list are missing.');
});

test('home band: a stale list that was never read says so instead of inventing a date', () => {
  const f = feed('unavailable', 'unavailable', 'unavailable');
  for (const k of ['central', 'state', 'gem']) f.sources[k].lastSuccessAt = null;
  const v = homeBandView(f);
  assert.equal(v.labels.central, 'open in our last update');
  assert.equal(v.note, 'Last updated: Central government (no update recorded), State portals (no update recorded), GeM bids (no update recorded). '
    + 'Newer tenders in those lists are missing.');
});
