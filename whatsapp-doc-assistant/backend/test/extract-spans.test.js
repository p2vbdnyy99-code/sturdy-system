// Structured span extraction: geometry + font + bold/italic (Phase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpans, spansToText, fontFamily } from '../src/extract/spans.js';
import { formattingPdf, twoPagePdf } from './fixtures.mjs';

test('spans carry position, size, font and bold/italic', async () => {
  const { pages, pageCount } = await extractSpans(await formattingPdf(), { maxPages: 300 });
  assert.equal(pageCount, 1);
  const spans = pages[0].spans;
  assert.ok(spans.length >= 4);

  const heading = spans.find((s) => s.text.includes('Annual Report'));
  assert.ok(heading);
  assert.ok(heading.fontSize >= 20, `heading size ${heading.fontSize} should be large`);
  assert.equal(heading.bold, true);
  assert.equal(typeof heading.x, 'number');
  assert.equal(typeof heading.y, 'number');

  const bold = spans.find((s) => s.text.includes('bold'));
  assert.equal(bold.bold, true);
  const italic = spans.find((s) => s.text.includes('italic'));
  assert.equal(italic.italic, true);

  // Body text is smaller than the heading (relative-size headings work).
  const body = spans.find((s) => s.text.includes('Revenue'));
  assert.ok(body.fontSize < heading.fontSize);
});

test('maxPages bounds extraction (page-limit cannot be bypassed)', async () => {
  const { pages, pageCount, pagesRead, truncated } = await extractSpans(await twoPagePdf(), {
    maxPages: 1,
  });
  assert.equal(pageCount, 2);
  assert.equal(pagesRead, 1);
  assert.equal(pages.length, 1);
  assert.equal(truncated, true);
});

test('spansToText reconstructs readable text', async () => {
  const { pages } = await extractSpans(await formattingPdf(), { maxPages: 300 });
  const text = spansToText(pages);
  assert.ok(text.includes('Annual Report 2026'));
  assert.ok(text.includes('Revenue grew'));
});

test('fontFamily strips subset prefix and style suffix', () => {
  assert.equal(fontFamily('ABCDEF+Arial-BoldMT'), 'Arial');
  assert.equal(fontFamily('Helvetica-Oblique'), 'Helvetica');
  assert.equal(fontFamily(''), '');
});
