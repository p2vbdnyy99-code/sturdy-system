// PDF → Word: assert structure (headings, runs, bold/italic, tables, breaks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractSpans } from '../src/extract/spans.js';
import { buildDocModel } from '../src/docmodel.js';
import { buildDocx } from '../src/docx.js';
import { formattingPdf, ruledTablePdf, twoPagePdf } from './fixtures.mjs';

async function docXml(gen) {
  const { pages } = await extractSpans(await gen(), { maxPages: 300 });
  const buf = await buildDocx(buildDocModel(pages), { title: 'Doc' });
  assert.equal(Buffer.from(buf).slice(0, 2).toString('latin1'), 'PK');
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml').async('string');
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
