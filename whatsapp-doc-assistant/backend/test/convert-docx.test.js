// PDF → Word: assert structure (headings, runs, bold/italic, tables, breaks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractSpans } from '../src/extract/spans.js';
import { buildDocModel } from '../src/docmodel.js';
import { buildDocx } from '../src/docx.js';
import { formattingPdf, ruledTablePdf, twoPagePdf, twoColumnBulletsPdf, wrappedBulletPdf, sidebarColumnsPdf } from './fixtures.mjs';

async function docXml(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  const buf = await buildDocx(buildDocModel(pages), { title: 'Doc' });
  assert.equal(Buffer.from(buf).slice(0, 2).toString('latin1'), 'PK');
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml').async('string');
}

async function modelBlocks(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  return buildDocModel(pages).blocks;
}

test('formatting PDF → headings, real bold + italic runs, sized runs', async () => {
  const xml = await docXml(formattingPdf);
  assert.ok(xml.includes('Annual Report 2026'));
  assert.ok(/Heading1/.test(xml), 'has a Heading 1');
  assert.ok(/Heading2/.test(xml), 'has a Heading 2');
  assert.ok(/<w:b\/>/.test(xml), 'has a bold run');
  assert.ok(/<w:i\/>/.test(xml), 'has an italic run');
  assert.ok(/<w:sz w:val="\d+"\/>/.test(xml), 'runs carry explicit sizes');
  // Not the old lossy approach: more than one paragraph, multiple runs.
  assert.ok((xml.match(/<w:p[ >]/g) || []).length >= 3, 'multiple paragraphs');
});

test('PDF with a table → a real DOCX table with the right cells', async () => {
  const xml = await docXml(ruledTablePdf);
  assert.ok(/<w:tbl>/.test(xml), 'contains a DOCX table');
  for (const cell of ['Product', 'Q1', 'Q2', 'Q3', 'Product A', '100', '140']) {
    assert.ok(xml.includes(cell), `table cell "${cell}" present`);
  }
});

test('two-page PDF → page break + both page titles preserved', async () => {
  const xml = await docXml(twoPagePdf);
  assert.ok(xml.includes('Page One Title'));
  assert.ok(xml.includes('Page Two Title'));
  assert.ok(/<w:br w:type="page"\/>/.test(xml), 'has an explicit page break');
});

test('two bullets on one visual line → split into two list items, wrap reattaches to the correct column', async () => {
  const blocks = await modelBlocks(twoColumnBulletsPdf);
  const items = blocks.filter((b) => b.type === 'listitem').map((b) => b.runs.map((r) => r.text).join(''));
  assert.equal(items.length, 4, `expected 4 list items, got: ${JSON.stringify(items)}`);
  assert.ok(items[0].includes('Ophthalmic Imaging Interpretation'));
  assert.ok(items[0].includes('Perimetry)'), 'wrapped continuation reattaches to the LEFT item, not the right one');
  assert.ok(!items[1].includes('Perimetry)'), 'right-column item does not absorb the left column wrap');
  assert.ok(items[1].includes('AI Dataset Annotation'));
  assert.ok(items[2].includes('Glaucoma Diagnosis'));
  assert.ok(items[3].includes('Clinical Workflow Design'));
});

test('a wrapped bullet line stays part of the same list item (not an orphan paragraph)', async () => {
  const blocks = await modelBlocks(wrappedBulletPdf);
  const items = blocks.filter((b) => b.type === 'listitem');
  assert.equal(items.length, 2, `expected 2 list items, got types: ${JSON.stringify(blocks.map((b) => b.type))}`);
  const firstText = items[0].runs.map((r) => r.text).join('');
  assert.ok(firstText.includes('cataract surgeries'));
  assert.ok(firstText.includes('structured records'), 'wrapped continuation merged into the same list item');
  // No stray unindented paragraph carrying the continuation text.
  assert.ok(!blocks.some((b) => b.type === 'paragraph' && b.runs.some((r) => r.text.includes('structured records'))));
});

test('a genuine sidebar layout is detected and rendered as a borderless two-column table', async () => {
  const xml = await docXml(sidebarColumnsPdf);
  assert.ok(/<w:tbl>/.test(xml), 'renders a DOCX table for the column region');
  assert.ok(xml.includes('CONTACT'));
  assert.ok(xml.includes('SKILLS'));
  assert.ok(xml.includes('PROFESSIONAL SUMMARY'));
  assert.ok(xml.includes('Senior Manager, Acme Corp'));
  assert.ok(/<w:tblBorders><w:top w:val="none"/.test(xml), 'table borders are suppressed');
});

test('single-column prose/table fixtures never trigger the column-layout path', async () => {
  for (const gen of [formattingPdf, ruledTablePdf, twoPagePdf]) {
    const blocks = await modelBlocks(gen);
    assert.ok(!blocks.some((b) => b.type === 'columns'), `${gen.name} unexpectedly produced a columns block`);
  }
});
