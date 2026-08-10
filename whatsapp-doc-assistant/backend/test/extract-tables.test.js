// Deterministic table detection (Phase 4): grids, confidence, no fabrication.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpans } from '../src/extract/spans.js';
import { detectTables, TABLE_CONFIDENCE_MIN } from '../src/extract/tables.js';
import { ruledTablePdf, borderlessTablePdf, proseOnlyPdf } from './fixtures.mjs';

async function page1(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  return pages[0];
}

test('ruled table → one high-confidence 4×3 grid, exact cells', async () => {
  const tables = detectTables(await page1(ruledTablePdf));
  assert.equal(tables.length, 1);
  const t = tables[0];
  assert.equal(t.colCount, 4);
  assert.equal(t.rowCount, 3);
  assert.ok(t.confidence >= TABLE_CONFIDENCE_MIN);
  assert.equal(t.ruled, true);
  assert.deepEqual(t.rows[0], ['Product', 'Q1', 'Q2', 'Q3']);
  assert.deepEqual(t.rows[1], ['Product A', '100', '120', '140']);
  assert.deepEqual(t.rows[2], ['Product B', '80', '90', '110']);
});

test('borderless aligned table → correct grid via coordinate clustering', async () => {
  const tables = detectTables(await page1(borderlessTablePdf));
  assert.equal(tables.length, 1);
  const t = tables[0];
  assert.equal(t.colCount, 4);
  assert.ok(t.confidence >= TABLE_CONFIDENCE_MIN);
  assert.deepEqual(t.rows[0], ['Item', 'Price', 'Growth', 'Date']);
  assert.deepEqual(t.rows[1], ['Widget', '$1,200', '15%', '2026-01-31']);
});

test('prose page → no table detected (does not hallucinate a grid)', async () => {
  const tables = detectTables(await page1(proseOnlyPdf)).filter(
    (t) => t.confidence >= TABLE_CONFIDENCE_MIN,
  );
  assert.equal(tables.length, 0);
});
