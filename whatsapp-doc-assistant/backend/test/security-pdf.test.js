// Security: PDF page-count cap (page-bomb / CPU-DoS bound).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesToRead, MAX_PDF_PAGES } from '../src/pdf.js';

test('the cap is a positive integer sourced from config (default 300)', () => {
  assert.equal(Number.isInteger(MAX_PDF_PAGES), true);
  assert.ok(MAX_PDF_PAGES >= 1);
  assert.equal(MAX_PDF_PAGES, 300); // default when MAX_PDF_PAGES env is unset
});

test('reads all pages when under the cap', () => {
  assert.equal(pagesToRead(1), 1);
  assert.equal(pagesToRead(50), 50);
  assert.equal(pagesToRead(MAX_PDF_PAGES), MAX_PDF_PAGES);
});

test('caps extraction for many-page / page-bomb PDFs', () => {
  assert.equal(pagesToRead(MAX_PDF_PAGES + 1), MAX_PDF_PAGES);
  assert.equal(pagesToRead(1_000_000), MAX_PDF_PAGES);
  assert.equal(pagesToRead(50, 10), 10); // explicit cap
});

test('handles bogus page counts safely (defaults to 1)', () => {
  assert.equal(pagesToRead(0), 1);
  assert.equal(pagesToRead(-5), 1);
  assert.equal(pagesToRead(NaN), 1);
  assert.equal(pagesToRead(undefined), 1);
  assert.equal(pagesToRead(3.9), 3); // floored
});
