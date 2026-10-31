// Regression matrix for the PDF → Word reconstruction engine, run after the
// list-fidelity fixes and the column-layout detector landed. Each scenario
// asserts: no exceptions, a valid .docx, full text completeness, and the
// structural shape expected for that document type — so a future change that
// silently breaks one category (e.g. tables) shows up here immediately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { extractSpans } from '../src/extract/spans.js';
import { buildDocModel } from '../src/docmodel.js';
import { buildDocx } from '../src/docx.js';
import {
  formattingPdf,
  ruledTablePdf,
  borderlessTablePdf,
  proseOnlyPdf,
  twoColumnBulletsPdf,
  wrappedBulletPdf,
  sidebarColumnsPdf,
  newsletterColumnsPdf,
  twoPagePdf,
  headerFooterPdf,
} from './fixtures.mjs';

const CV_PATH = '/root/.claude/uploads/900d2b7f-57f0-5e7d-a463-1ebd9e859615/c8c28b89-Sayali_Londhe_CV_040526.pdf';

async function convert(buffer) {
  const { pages } = await extractSpans(buffer, { maxPages: 300 });
  const model = buildDocModel(pages);
  const buf = await buildDocx(model, { title: undefined });
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const docText = [...xml.matchAll(/<w:t[ >][^<]*/g)].map((m) => m[0].replace(/<w:t[^>]*>?/, '')).join(' ');
  const docWords = docText.split(/\s+/).filter(Boolean);
  const srcWords = pages.flatMap((p) => p.spans).flatMap((s) => s.text.split(/\s+/)).filter(Boolean);
  return { pages, model, buf, xml, completeness: srcWords.length ? docWords.length / srcWords.length : 1 };
}

test('1. single-column formatted document: headings/bold/italic preserved, no false column split', async () => {
  const { model, buf, completeness } = await convert(await formattingPdf());
  assert.equal(Buffer.from(buf).slice(0, 2).toString('latin1'), 'PK');
  assert.ok(completeness >= 0.95, `completeness ${completeness}`);
  assert.ok(model.blocks.some((b) => b.type === 'heading'));
  assert.ok(!model.blocks.some((b) => b.type === 'columns'));
});

test('2. multi-column document (sidebar CV style): detected and reconstructed as a table', async () => {
  const { model, completeness } = await convert(await sidebarColumnsPdf());
  assert.ok(completeness >= 0.95, `completeness ${completeness}`);
  assert.ok(model.blocks.some((b) => b.type === 'columns'), 'sidebar layout must be detected');
});

test('2b. multi-column document (equal-width newsletter style): detected and reconstructed as a table', async () => {
  const { model, completeness } = await convert(await newsletterColumnsPdf());
  assert.ok(completeness >= 0.95, `completeness ${completeness}`);
  assert.ok(model.blocks.some((b) => b.type === 'columns'), 'newsletter layout must be detected');
});

test('3. table-heavy PDF: ruled and borderless tables both reconstructed as real DOCX tables', async () => {
  const ruled = await convert(await ruledTablePdf());
  assert.ok(ruled.model.blocks.some((b) => b.type === 'table'));
  assert.ok(ruled.completeness >= 0.95);

  const borderless = await convert(await borderlessTablePdf());
  assert.ok(borderless.model.blocks.some((b) => b.type === 'table'));
  assert.ok(borderless.completeness >= 0.95);

  const prose = await convert(await proseOnlyPdf());
  assert.ok(!prose.model.blocks.some((b) => b.type === 'table'), 'must not fabricate a table from prose');
});

test('4. bulleted/list-heavy PDF: multi-bullet lines split, wraps reattach correctly', async () => {
  const multi = await convert(await twoColumnBulletsPdf());
  const items = multi.model.blocks.filter((b) => b.type === 'listitem');
  assert.equal(items.length, 4);
  assert.ok(multi.completeness >= 0.95);

  const wrapped = await convert(await wrappedBulletPdf());
  const wrappedItems = wrapped.model.blocks.filter((b) => b.type === 'listitem');
  assert.equal(wrappedItems.length, 2);
  assert.ok(!wrapped.model.blocks.some((b) => b.type === 'paragraph'), 'no orphan continuation paragraphs');
});

test('5. multi-page document: page break present, both pages fully reconstructed', async () => {
  const { model, completeness } = await convert(await twoPagePdf());
  assert.ok(model.blocks.some((b) => b.type === 'pagebreak'));
  assert.ok(completeness >= 0.95);
});

test('6. PDF with running header/footer: stays full-width prose, no spurious column split', async () => {
  const { model, completeness } = await convert(await headerFooterPdf());
  assert.ok(completeness >= 0.95, `completeness ${completeness}`);
  assert.ok(!model.blocks.some((b) => b.type === 'columns'), 'header/footer must not trigger column detection');
});

test('7. real-world CV: 100% text completeness, no fabricated columns, list fidelity intact', async (t) => {
  if (!fs.existsSync(CV_PATH)) {
    t.skip('sample CV not present in this environment');
    return;
  }
  const { model, completeness } = await convert(fs.readFileSync(CV_PATH));
  assert.equal(completeness, 1, `expected 100% completeness, got ${(completeness * 100).toFixed(1)}%`);
  assert.ok(!model.blocks.some((b) => b.type === 'columns'), 'this CV is single-column; must not force a split');
  const items = model.blocks.filter((b) => b.type === 'listitem').map((b) => b.runs.map((r) => r.text).join(''));
  assert.ok(items.some((t2) => t2.includes('Perimetry)')), 'wrapped bullet text preserved');
  assert.ok(!items.some((t2) => t2.includes('•') && t2.split('•').length > 2), 'no line still carries 2+ bullets merged');
});
