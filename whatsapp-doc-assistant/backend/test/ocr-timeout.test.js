// OCR timeout safety net.
// -----------------------------------------------------------------------------
// A user-facing webhook must never wait indefinitely on OCR. This tests the
// mechanism added after a real production hang: `extractStructured` (the
// entire extraction+OCR pipeline) is wrapped in the same `withTimeout(...)`
// pattern already used for DOCX/XLSX conversion, with its own budget
// (OCR_TIMEOUT_MS, separate from CONVERSION_TIMEOUT_MS — OCR scales with page
// count/image complexity in a way conversion doesn't).
//
// Known, documented limitation (not fixed here, out of scope for this change):
// withTimeout stops US waiting on the promise; it does not cancel whatever
// rasterization/Tesseract work is already in flight. On timeout the underlying
// computation may keep running in the background until it finishes on its
// own — real cancellation would need OCR isolated in its own worker/process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, friendlyErrorMessage } from '../src/router.js';
import { extractStructured } from '../src/pdf.js';
import { buildOcrConfig, config } from '../src/config.js';
import { AIError } from '../src/ai/index.js';
import { formattingPdf, toScannedPdf } from './fixtures.mjs';

test('successful extraction completes normally when it finishes before the timeout', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const result = await withTimeout(extractStructured(scanned), 60_000, 'PDF extraction/OCR');
  assert.equal(result.ocrUsed, true);
  assert.ok(result.text.includes('Annual Report 2026'));
});

test('extraction that exceeds the budget rejects with an identifiable timeout error', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  // A real (slow) OCR call raced against an impossibly small budget — proves
  // the wrapping actually aborts waiting, not just that a fixture is well-formed.
  await assert.rejects(
    () => withTimeout(extractStructured(scanned), 1, 'PDF extraction/OCR'),
    /PDF extraction\/OCR timed out/,
  );
});

test('a timeout error maps to the existing generic user-facing message, never document content', () => {
  const timeoutErr = new Error('PDF extraction/OCR timed out');
  assert.equal(
    friendlyErrorMessage(timeoutErr),
    '⚠️ Something went wrong on my side. Please try again in a moment.',
  );
});

test('a known AI error still gets its own specific (still safe) message — timeout handling did not change this', () => {
  const aiErr = new AIError('rate_limit');
  assert.equal(friendlyErrorMessage(aiErr), `⚠️ ${aiErr.userMessage}`);
  assert.notEqual(
    friendlyErrorMessage(aiErr),
    '⚠️ Something went wrong on my side. Please try again in a moment.',
  );
});

test('OCR_TIMEOUT_MS is configurable and defaults to 180000ms (3 minutes), separate from CONVERSION_TIMEOUT_MS', () => {
  assert.equal(buildOcrConfig({}).timeoutMs, 180_000);
  assert.equal(buildOcrConfig({ OCR_TIMEOUT_MS: '30000' }).timeoutMs, 30_000);
  // A tiny/invalid value is still floored, same defensive pattern as the rest
  // of config.js's numeric parsing (Math.max guards).
  assert.equal(buildOcrConfig({ OCR_TIMEOUT_MS: '10' }).timeoutMs, 1000);
  assert.equal(buildOcrConfig({ OCR_TIMEOUT_MS: 'not-a-number' }).timeoutMs, 180_000);
});

test('the running config actually uses the 3-minute OCR default this milestone specified', () => {
  assert.equal(config.ocr.timeoutMs, 180_000);
});

test('CONVERSION_TIMEOUT_MS is untouched by this change (still 45s default, still separate)', () => {
  assert.equal(config.server.conversionTimeoutMs, 45_000);
  assert.notEqual(config.server.conversionTimeoutMs, config.ocr.timeoutMs);
});
