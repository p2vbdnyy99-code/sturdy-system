// PDF → Excel: assert ACTUAL cell coordinates and types, not just presence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extractSpans } from '../src/extract/spans.js';
import { detectTables, detectTablesAcrossPages, TABLE_CONFIDENCE_MIN } from '../src/extract/tables.js';
import { buildXlsx, typeCell } from '../src/xlsx.js';
import { ruledTablePdf, borderlessTablePdf, proseOnlyPdf } from './fixtures.mjs';

async function toWorkbook(tables) {
  const buf = await buildXlsx(tables);
  assert.equal(Buffer.from(buf).slice(0, 2).toString('latin1'), 'PK'); // real xlsx (zip)
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

async function tablesFor(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  return detectTables(pages[0]).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);
}

test('ruled table → exact cell grid at correct coordinates', async () => {
  const wb = await toWorkbook(await tablesFor(ruledTablePdf));
  const ws = wb.getWorksheet('Table 1');
  assert.equal(ws.getCell('A1').value, 'Product');
  assert.equal(ws.getCell('B1').value, 'Q1');
  assert.equal(ws.getCell('C1').value, 'Q2');
  assert.equal(ws.getCell('D1').value, 'Q3');
  assert.equal(ws.getCell('A2').value, 'Product A');
  assert.equal(ws.getCell('B2').value, 100); // number, not string
  assert.equal(ws.getCell('C2').value, 120);
  assert.equal(ws.getCell('D2').value, 140);
  assert.equal(ws.getCell('A3').value, 'Product B');
  assert.equal(ws.getCell('B3').value, 80);
  assert.equal(typeof ws.getCell('B2').value, 'number');
  assert.equal(ws.getCell('A1').font?.bold, true); // bold header
});

test('borderless table → correct cells with typed currency/percent/date', async () => {
  const wb = await toWorkbook(await tablesFor(borderlessTablePdf));
  const ws = wb.getWorksheet('Table 1');
  assert.equal(ws.getCell('A1').value, 'Item');
  assert.equal(ws.getCell('B1').value, 'Price');
  assert.equal(ws.getCell('A2').value, 'Widget');
  assert.equal(ws.getCell('B2').value, 1200); // "$1,200" → number
  assert.match(ws.getCell('B2').numFmt || '', /\$/);
  assert.equal(ws.getCell('C2').value, 0.15); // "15%" → 0.15
  assert.match(ws.getCell('C2').numFmt || '', /%/);
  assert.ok(ws.getCell('D2').value instanceof Date); // ISO date
  assert.equal(ws.getCell('A3').value, 'Gadget');
});

test('prose-only PDF yields no confident table (hard rule — no fabrication)', async () => {
  const tables = await tablesFor(proseOnlyPdf);
  assert.equal(tables.length, 0);
});

test('multiple tables land on separate worksheets', async () => {
  // Two independent ruled tables → two sheets.
  const t = await tablesFor(ruledTablePdf);
  const wb = await toWorkbook([t[0], { ...t[0] }]);
  assert.ok(wb.getWorksheet('Table 1'));
  assert.ok(wb.getWorksheet('Table 2'));
});

test('typeCell infers types confidently and leaves ambiguity as string', () => {
  assert.deepEqual(typeCell('$1,200'), { value: 1200, numFmt: '"$"#,##0.##' });
  assert.deepEqual(typeCell('15%'), { value: 0.15, numFmt: '0%' });
  assert.deepEqual(typeCell('12.5%'), { value: 0.125, numFmt: '0.00%' });
  assert.equal(typeCell('1,234').value, 1234);
  assert.equal(typeCell('42').value, 42);
  assert.ok(typeCell('2026-01-31').value instanceof Date);
  assert.deepEqual(typeCell(''), { value: null }); // blank stays blank
  assert.deepEqual(typeCell('N/A'), { value: 'N/A' }); // ambiguous → string
  assert.equal(typeCell('12/31/2026').value, '12/31/2026'); // ambiguous date → string
});
