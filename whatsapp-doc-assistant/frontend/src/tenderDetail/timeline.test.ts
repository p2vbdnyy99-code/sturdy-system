import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, daysPhrase } from './timeline.ts';

const now = new Date(2026, 9, 12, 10, 0);
const day = (n: number) => new Date(2026, 9, 12 + n, 15, 0).toISOString();
const d = (id: string, parsedDate: string | null, rawText = 'as written') => ({ id, label: id, rawText, parsedDate });

test('dates are ordered, with today between the past and the future', () => {
  const t = buildTimeline([d('opening', day(7)), d('pre-bid', day(-3)), d('submission', day(5))], now);
  assert.deepEqual(t.entries.map((e) => (e.kind === 'today' ? 'TODAY' : e.item.id)), ['pre-bid', 'TODAY', 'submission', 'opening']);
  const past = t.entries[0];
  assert.ok(past.kind === 'date' && past.past && past.days === -3);
});

test('a date due today comes after the today marker; all-past dates end with it', () => {
  assert.deepEqual(buildTimeline([d('x', day(0))], now).entries.map((e) => e.kind), ['today', 'date']);
  assert.deepEqual(buildTimeline([d('a', day(-9)), d('b', day(-2))], now).entries.map((e) => e.kind), ['date', 'date', 'today']);
});

test('dates that did not parse are listed separately, and nothing is invented', () => {
  const t = buildTimeline([d('site visit', null, 'as notified'), d('bad', 'garbage')], now);
  assert.deepEqual(t.entries, []);
  assert.deepEqual(t.undated.map((x) => x.id), ['site visit', 'bad']);
});

test('daysPhrase', () => {
  assert.equal(daysPhrase(0), 'today');
  assert.equal(daysPhrase(1), 'tomorrow');
  assert.equal(daysPhrase(-1), 'yesterday');
  assert.equal(daysPhrase(6), 'in 6 days');
  assert.equal(daysPhrase(-4), '4 days ago');
});
