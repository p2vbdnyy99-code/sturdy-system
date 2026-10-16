// Layout-complexity detector.
// -----------------------------------------------------------------------------
// The converter reconstructs 1- and 2-column documents well but scrambles the
// reading order of 3+ column designer templates. Rather than attempt an
// open-ended layout engine, we DETECT the hard case and warn. These tests lock
// down the contract that actually matters: flag genuinely-unhandleable layouts,
// and — just as important — do NOT cry wolf on the layouts we handle, or every
// warning becomes noise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpans } from '../src/extract/spans.js';
import { assessLayout } from '../src/extract/complexity.js';
import {
  formattingPdf,
  proseOnlyPdf,
  ruledTablePdf,
  twoPagePdf,
  twoColumnBulletsPdf,
  sidebarColumnsPdf,
  newsletterColumnsPdf,
} from './fixtures.mjs';

async function assess(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  return assessLayout(pages);
}

test('simple single-column layouts are NOT flagged complex', async () => {
  for (const gen of [formattingPdf, proseOnlyPdf, twoPagePdf, ruledTablePdf, twoColumnBulletsPdf]) {
    const a = await assess(gen);
    assert.equal(a.complex, false, `${gen.name} should be simple, got ${JSON.stringify(a)}`);
    assert.ok(a.columnCount <= 2, `${gen.name} columnCount ${a.columnCount}`);
  }
});

test('two-column layouts we HANDLE (sidebar, newsletter) are NOT flagged — no false alarms', async () => {
  const sidebar = await assess(sidebarColumnsPdf);
  assert.equal(sidebar.complex, false, `sidebar flagged: ${JSON.stringify(sidebar)}`);

  const news = await assess(newsletterColumnsPdf);
  assert.equal(news.complex, false, `newsletter flagged: ${JSON.stringify(news)}`);
});

test('assessLayout is deterministic and returns a well-formed shape', async () => {
  const a = await assess(formattingPdf);
  for (const k of ['complex', 'columnCount', 'crossColumnRatio', 'reason']) {
    assert.ok(k in a, `missing key ${k}`);
  }
  assert.equal(typeof a.complex, 'boolean');
  assert.equal(typeof a.columnCount, 'number');
  const b = await assess(formattingPdf);
  assert.deepEqual(a, b, 'same input yields identical assessment');
});

test('empty / trivial input is treated as simple, never throws', () => {
  assert.equal(assessLayout([]).complex, false);
  assert.equal(assessLayout(undefined).complex, false);
  assert.equal(assessLayout([{ spans: [] }]).complex, false);
});

test('a synthesized 3-column page IS flagged complex (the case we cannot reconstruct)', () => {
  // Three clear x-clusters (~50 / ~250 / ~450), many lines each, spans that
  // straddle the gutters — the designer-CV signature. Built directly as spans
  // (not via pdfkit) so the geometry is unambiguous and the test is fast.
  const spans = [];
  for (let row = 0; row < 12; row += 1) {
    const y = 60 + row * 16;
    for (const x of [50, 250, 450]) {
      spans.push({ text: `c${x}r${row}`, x, y, w: 120, h: 10, fontSize: 10, page: 1 });
    }
  }
  const a = assessLayout([{ page: 1, width: 595, height: 842, spans }]);
  assert.equal(a.complex, true, `expected complex, got ${JSON.stringify(a)}`);
  assert.equal(a.columnCount, 3);
  assert.match(a.reason, /3-column/);
});
