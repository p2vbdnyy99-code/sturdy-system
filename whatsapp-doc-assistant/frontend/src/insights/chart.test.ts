// Runs via `node --test src/insights/chart.test.ts` (Node 22 type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, compact, delta, linePaths, niceMax, stepRate, xAt, yAt } from './chart.ts';

test('niceMax rounds up to a clean axis top', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(3), 5);
  assert.equal(niceMax(17), 20);
  assert.equal(niceMax(82), 100);
  assert.equal(niceMax(240), 250);
});

test('positions: first and last points sit on the edges, zero on the baseline', () => {
  assert.equal(xAt(0, 7, 10, 70), 10);
  assert.equal(xAt(6, 7, 10, 70), 70);
  assert.equal(xAt(0, 1, 10, 70), 40);
  assert.equal(yAt(0, 10, 200, 20), 200);
  assert.equal(yAt(10, 10, 200, 20), 20);
});

test('linePaths draws one point per value and closes the area on the baseline', () => {
  const { line, area } = linePaths([0, 5, 10], { left: 0, right: 100, top: 0, bottom: 100 }, 10);
  assert.equal(line, 'M0.0,100.0 L50.0,50.0 L100.0,0.0');
  assert.ok(area.endsWith('L100.0,100 L0.0,100 Z'));
  assert.deepEqual(linePaths([], { left: 0, right: 1, top: 0, bottom: 1 }), { line: '', area: '' });
});

test('compact and delta', () => {
  assert.equal(compact(1284), '1,284');
  assert.equal(compact(12900), '12.9K');
  assert.equal(compact(3_400_000), '3.4M');
  assert.deepEqual(delta(5, 5), { text: 'no change', dir: 'flat' });
  assert.deepEqual(delta(3, 0), { text: '+3 new', dir: 'up' });
  assert.deepEqual(delta(82, 41), { text: '+100%', dir: 'up' });
  assert.deepEqual(delta(1, 4), { text: '-75%', dir: 'down' });
  assert.equal(stepRate(1, 4), '25%');
  assert.equal(stepRate(1, 0), '–');
});

test('ago', () => {
  const now = Date.parse('2026-10-22T10:00:00Z');
  assert.equal(ago('2026-10-22T09:59:30Z', now), 'just now');
  assert.equal(ago('2026-10-22T09:55:00Z', now), '5 min ago');
  assert.equal(ago('2026-10-22T07:00:00Z', now), '3 h ago');
  assert.equal(ago('2026-10-21T09:00:00Z', now), '1 day ago');
  assert.equal(ago(null, now), '–');
});
