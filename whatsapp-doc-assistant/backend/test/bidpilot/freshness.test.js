// How fresh the tender lists are (src/bidpilot/discovery/freshness.js): the
// statuses, the public view, the once-only monitor, the landing-page and
// markdown wording, and that the nightly email uses the same thresholds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRESH_HOURS, STALE_HOURS, UNAVAILABLE_DAYS, sourceFreshness, feedFreshness, publicFreshness, freshnessFor,
  feedChanges, staleNotice,
} from '../../src/bidpilot/discovery/freshness.js';
import { startFeedMonitor } from '../../src/bidpilot/discovery/collector.js';
import { landingCountLine, renderLandingHtml, landingMarkdown } from '../../src/landingPages.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-11-05T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000);
const ON = { cppp: true, lists: ['central', 'state', 'gem'] };

test('statuses: fresh, delayed, stale and unavailable follow the documented thresholds', () => {
  const at = (h) => sourceFreshness({ list: 'central', enabled: true, lastSuccessAt: hoursAgo(h) }, NOW);
  assert.equal(at(0.5).status, 'fresh');
  assert.equal(at(FRESH_HOURS).status, 'fresh');
  assert.equal(at(FRESH_HOURS + 0.1).status, 'delayed');
  assert.equal(at(STALE_HOURS).status, 'delayed');
  assert.equal(at(STALE_HOURS + 1).status, 'stale');
  assert.equal(at(UNAVAILABLE_DAYS * 24).status, 'stale');
  const failing = at(UNAVAILABLE_DAYS * 24 + 1);
  assert.deepEqual([failing.status, failing.reason], ['unavailable', 'failing']);
});

test('unavailable: switched off, or never read; missing and bad timestamps never count as an update', () => {
  const off = sourceFreshness({ list: 'gem', enabled: false, lastSuccessAt: hoursAgo(0.1) }, NOW);
  assert.deepEqual([off.status, off.reason], ['unavailable', 'off'], 'switched off wins over a recent success');
  for (const lastSuccessAt of [null, undefined, 'not a date']) {
    const s = sourceFreshness({ list: 'state', enabled: true, lastSuccessAt }, NOW);
    assert.deepEqual([s.status, s.reason, s.lastSuccessAt], ['unavailable', 'never', null]);
  }
});

test('a failed attempt is reported separately and is never the last update', () => {
  const s = sourceFreshness({
    list: 'central', enabled: true, lastSuccessAt: '2026-10-23T15:29:45Z', lastError: 'CPPP answered 404', updatedAt: '2026-11-05T11:59:00Z',
  }, NOW);
  assert.equal(s.lastSuccessAt, '2026-10-23T15:29:45.000Z');
  assert.equal(s.lastFailureAt, '2026-11-05T11:59:00.000Z');
  assert.equal(s.lastError, 'CPPP answered 404');
  assert.equal(s.status, 'unavailable', '13 days without a success');
  const ok = sourceFreshness({ list: 'central', enabled: true, lastSuccessAt: hoursAgo(1), lastError: null, updatedAt: hoursAgo(1) }, NOW);
  assert.equal(ok.lastFailureAt, null, 'no error, no failure time');
});

test('the whole feed: every list, the worst enabled one, and a public view without errors', () => {
  const rows = [
    { list: 'central', lastSuccessAt: hoursAgo(1), lastError: null, updatedAt: hoursAgo(1) },
    { list: 'state', lastSuccessAt: hoursAgo(30), lastError: 'fetch failed', updatedAt: hoursAgo(0.2) },
  ];
  const f = feedFreshness(rows, ON, NOW);
  assert.deepEqual(f.sources.map((s) => [s.list, s.status]), [['central', 'fresh'], ['state', 'stale'], ['gem', 'unavailable']]);
  assert.equal(f.status, 'unavailable', 'GeM was never read');
  const onlyCentral = feedFreshness(rows, { cppp: true, lists: ['central'] }, NOW);
  assert.equal(onlyCentral.status, 'fresh', 'switched-off lists do not drag the overall status down');
  const pub = publicFreshness(f);
  assert.ok(!JSON.stringify(pub).includes('fetch failed'), 'no error text in public');
  assert.deepEqual(Object.keys(pub.sources.state).sort(), ['lastSuccessAt', 'status']);
  assert.equal(freshnessFor(pub, 'central').status, 'fresh');
  assert.equal(freshnessFor(pub).status, 'unavailable');
  const allOff = feedFreshness(rows, { cppp: false, lists: ['central', 'state', 'gem'] }, NOW);
  assert.equal(allOff.status, 'unavailable', 'collector switched off');
});

test('monitor: one warning per worsening, one note on recovery, silence while unchanged', async () => {
  const changes = (prev, statuses) => feedChanges(prev, { sources: Object.entries(statuses).map(([list, status]) => ({ list, status })) });
  let c = changes(null, { central: 'stale', state: 'fresh' });
  assert.deepEqual(c.worse.map((s) => s.list), ['central']);
  c = changes(c.statuses, { central: 'stale', state: 'fresh' });
  assert.equal(c.worse.length + c.recovered.length, 0, 'unchanged: nothing');
  c = changes(c.statuses, { central: 'unavailable', state: 'fresh' });
  assert.deepEqual(c.worse.map((s) => s.list), ['central'], 'worse again: once more');
  c = changes(c.statuses, { central: 'fresh', state: 'fresh' });
  assert.deepEqual(c.recovered.map((s) => s.list), ['central']);

  // The hourly check itself, with a stub database and logger.
  const logs = [];
  const logger = { warn: (m) => logs.push(['warn', m]), info: (m) => logs.push(['info', m]) };
  let rows = [{ list: 'central', lastSuccessAt: new Date(Date.now() - 30 * 3600e3), lastError: 'CPPP answered 404', updatedAt: new Date() }];
  const db = { select: () => ({ from: async () => rows }) };
  const stop = startFeedMonitor(db, { everyMs: 1e9, settings: { cppp: true, lists: ['central'] }, logger });
  try {
    await stop.checkNow();
    await stop.checkNow();
    const warns = logs.filter(([k]) => k === 'warn');
    assert.equal(warns.length, 1, 'the same failure is logged once');
    assert.match(warns[0][1], /central list is stale; last success .*; last error: CPPP answered 404/);
    assert.deepEqual(logs.filter(([k, m]) => k === 'info' && /switched off/.test(m)).map(([, m]) => m),
      ['bidpilot feed: state list is switched off', 'bidpilot feed: gem list is switched off'], 'lists off on purpose: noted once, no warning');
    rows = [{ list: 'central', lastSuccessAt: new Date(), lastError: null, updatedAt: new Date() }];
    await stop.checkNow();
    assert.match(logs.at(-1)[1], /central list recovered/);
  } finally {
    stop();
  }
});

test('landing pages: "right now" only while fresh; otherwise the last update date and a notice (HTML and markdown)', () => {
  const page = { kind: 'state', state: 'Maharashtra', label: 'Maharashtra', count: 60, path: '/government-tenders/state/maharashtra' };
  const fresh = publicFreshness(feedFreshness([{ list: 'state', lastSuccessAt: hoursAgo(1) }], ON, NOW));
  const stale = publicFreshness(feedFreshness([{ list: 'state', lastSuccessAt: '2026-10-23T15:29:50Z' }], ON, NOW));
  assert.deepEqual(landingCountLine(page, fresh), { count: '60 open tenders right now', notice: null });
  assert.deepEqual(landingCountLine(page, null), { count: '60 open tenders right now', notice: null }, 'unknown: old wording');
  const line = landingCountLine(page, stale);
  assert.equal(line.count, '60 open tenders in our last update (23 October 2026)');
  assert.match(line.notice, /^This list has not been updated since 23 October 2026\. Tenders published since then are missing/);

  const shell = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';
  const html = renderLandingHtml(shell, page, [], 'https://tendertez.in', [page], null, stale);
  assert.match(html, /<p class="notice">This list has not been updated since 23 October 2026/);
  assert.match(html, /60 open tenders in our last update \(23 October 2026\), closing soonest first/);
  assert.ok(!html.includes('right now'));
  assert.ok(renderLandingHtml(shell, page, [], 'https://tendertez.in', [page], null, fresh).includes('60 open tenders right now'));

  const md = landingMarkdown({ page, tenders: [], pages: [page], freshness: stale }, 'https://tendertez.in', NOW);
  assert.match(md, /> This list has not been updated since 23 October 2026/);
  assert.ok(!md.includes('right now'));
  assert.match(staleNotice({ status: 'delayed', lastSuccessAt: hoursAgo(5).toISOString() }), /the next update is late/);
});

test('the nightly email uses the same thresholds (marketing/automation/ttm/nightly.py)', () => {
  const py = readFileSync(path.join(here, '../../../../marketing/automation/ttm/nightly.py'), 'utf8');
  const num = (name) => Number(py.match(new RegExp(`^${name} = (\\d+)`, 'm'))?.[1]);
  assert.deepEqual([num('FRESH_HOURS'), num('STALE_HOURS'), num('UNAVAILABLE_DAYS')], [FRESH_HOURS, STALE_HOURS, UNAVAILABLE_DAYS]);
});
