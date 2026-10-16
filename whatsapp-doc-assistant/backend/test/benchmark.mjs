// Fidelity benchmark: OLD (PDF → flattened text → DOCX) vs NEW (structured).
// -----------------------------------------------------------------------------
// Not part of `npm test` — run with `npm run benchmark`. Generates a corpus with
// pdfkit, converts each PDF both ways, and reports where the new engine retains
// formatting the old one discarded, plus Excel cell accuracy. Deterministic;
// no network, no LLM. Scanned/OCR docs are out of scope for this milestone.

import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { extractSpans, spansToText } from '../src/extract/spans.js';
import { buildDocModel } from '../src/docmodel.js';
import { buildDocx, textToDocx } from '../src/docx.js';
import { detectTables, TABLE_CONFIDENCE_MIN } from '../src/extract/tables.js';
import { buildXlsx } from '../src/xlsx.js';
import { buildPdf, formattingPdf, ruledTablePdf, borderlessTablePdf, proseOnlyPdf } from './fixtures.mjs';

async function docFeatures(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  return {
    headings: /Heading\d/.test(xml),
    bold: /<w:b\/>/.test(xml),
    italic: /<w:i\/>/.test(xml),
    sizedRuns: /<w:sz w:val="\d+"\/>/.test(xml),
    tables: /<w:tbl>/.test(xml),
    paragraphs: (xml.match(/<w:p[ >]/g) || []).length,
    bytes: buf.length,
  };
}

async function convertOld(pages) {
  // The previous pipeline: flatten spans to text, then plain-text DOCX.
  const flat = pages.map((pg) => pg.spans.map((s) => s.text).join(' ')).join('\n\n');
  return textToDocx(flat, 'Doc');
}
async function convertNew(pages) {
  return buildDocx(buildDocModel(pages), { title: 'Doc' });
}

const corpus = [
  { group: 'simple', name: 'plain-prose', gen: proseOnlyPdf },
  { group: 'simple', name: 'two-paragraphs', gen: () => buildPdf((d) => {
    d.font('Helvetica').fontSize(12).text('First paragraph of the document.');
    d.moveDown(); d.font('Helvetica').fontSize(12).text('Second paragraph of the document.');
  }) },
  { group: 'simple', name: 'centered-line', gen: () => buildPdf((d) => {
    d.font('Helvetica').fontSize(12).text('Centered heading', { align: 'center' });
    d.font('Helvetica').fontSize(12).text('Body follows.');
  }) },
  { group: 'formatting', name: 'headings+bold+italic', gen: formattingPdf },
  { group: 'formatting', name: 'size-hierarchy', gen: () => buildPdf((d) => {
    d.font('Helvetica-Bold').fontSize(28).text('Title');
    d.font('Helvetica-Bold').fontSize(18).text('Section');
    d.font('Helvetica').fontSize(11).text('Body text under the section.');
  }) },
  { group: 'formatting', name: 'bold-inline', gen: () => buildPdf((d) => {
    d.font('Helvetica-Bold').fontSize(20).text('Report');
    d.font('Helvetica').fontSize(12).text('Normal.');
    d.font('Helvetica-Oblique').fontSize(12).text('Emphasis.');
  }) },
];

const tableCorpus = [
  { name: 'ruled', gen: ruledTablePdf, expect: [
    ['Product', 'Q1', 'Q2', 'Q3'], ['Product A', '100', '120', '140'], ['Product B', '80', '90', '110'],
  ] },
  { name: 'borderless', gen: borderlessTablePdf, expect: [
    ['Item', 'Price', 'Growth', 'Date'], ['Widget', '$1,200', '15%', '2026-01-31'], ['Gadget', '$980', '8%', '2026-02-15'],
  ] },
];

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

console.log('\n=== DOCX fidelity: OLD (flattened text) vs NEW (structured) ===\n');
const agg = { old: {}, new: {} };
const KEYS = ['headings', 'bold', 'italic', 'sizedRuns'];
for (const k of KEYS) { agg.old[k] = 0; agg.new[k] = 0; }
for (const doc of corpus) {
  const { pages } = await extractSpans(await doc.gen(), { maxPages: 300 });
  const t0 = performance.now();
  const oldF = await docFeatures(await convertOld(pages));
  const t1 = performance.now();
  const newF = await docFeatures(await convertNew(pages));
  const t2 = performance.now();
  for (const k of KEYS) { agg.old[k] += oldF[k] ? 1 : 0; agg.new[k] += newF[k] ? 1 : 0; }
  const mark = (o, n) => `${o ? '✓' : '·'}→${n ? '✓' : '·'}`;
  console.log(
    `[${doc.group}] ${doc.name.padEnd(22)} ` +
    `head ${mark(oldF.headings, newF.headings)}  bold ${mark(oldF.bold, newF.bold)}  ` +
    `ital ${mark(oldF.italic, newF.italic)}  size ${mark(oldF.sizedRuns, newF.sizedRuns)}  ` +
    `| new ${((t2 - t1)).toFixed(0)}ms ${newF.bytes}B`,
  );
}
console.log('\nFeature retention across corpus (n=%d):', corpus.length);
for (const k of KEYS) console.log(`  ${k.padEnd(10)} OLD ${pct(agg.old[k], corpus.length)}%  →  NEW ${pct(agg.new[k], corpus.length)}%`);

console.log('\n=== Excel cell accuracy (NEW; OLD produced no .xlsx) ===\n');
for (const tc of tableCorpus) {
  const { pages } = await extractSpans(await tc.gen(), { maxPages: 300 });
  const tables = detectTables(pages[0]).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);
  let correct = 0; let total = 0;
  if (tables.length) {
    const buf = await buildXlsx(tables);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    for (let r = 0; r < tc.expect.length; r += 1) {
      for (let c = 0; c < tc.expect[r].length; c += 1) {
        total += 1;
        const cell = ws.getCell(r + 1, c + 1);
        const got = cell.value;
        const isPct = (cell.numFmt || '').includes('%');
        const gotStr = got instanceof Date ? got.toISOString().slice(0, 10)
          : typeof got === 'number' ? String(isPct ? Math.round(got * 100) : got)
          : String(got ?? '');
        const norm = (s) => s.replace(/[$,%]/g, '').replace(/\s+/g, '');
        if (norm(gotStr) === norm(tc.expect[r][c])) correct += 1;
      }
    }
  }
  console.log(`  ${tc.name.padEnd(12)} cell accuracy ${pct(correct, total)}%  (${correct}/${total})  tables=${tables.length}`);
}
console.log('\n(Note: fidelity claims are backed by these deterministic fixtures, not real-world PDFs yet.)\n');
