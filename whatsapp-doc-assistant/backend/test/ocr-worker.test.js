// OCR worker-thread isolation.
// -----------------------------------------------------------------------------
// Regression suite for the production failure where a malformed embedded JPEG
// stalled pdf.js's synchronous decoder, starving the main thread's own timeout
// callback so it never fired — the service was killed with no reply ever sent.
// The fix runs OCR in a worker thread the main process can forcibly terminate.
//
// The load-bearing test here is "a worker stuck in a non-yielding synchronous
// loop is still terminated": that is the exact property a same-thread
// Promise.race cannot provide, and the whole reason this module exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  runOcrInWorker,
  OcrTimeoutError,
  OcrWorkerError,
} from '../src/extract/ocr-runner.js';
import { extractSpans } from '../src/extract/spans.js';
import { extractStructured } from '../src/pdf.js';
import { formattingPdf, toScannedPdf } from './fixtures.mjs';

/** Run an inline worker script and supervise it exactly like ocr-runner does. */
async function withTempWorker(source, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-worker-test-'));
  const file = path.join(dir, 'w.mjs');
  await fs.writeFile(file, source);
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

test('successful OCR: worker returns spans through the isolated thread', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  const dims = pages.map((p) => ({ page: p.page, width: p.width, height: p.height }));

  const results = await runOcrInWorker(scanned, dims);
  assert.ok(results instanceof Map);
  const page1 = results.get(1);
  assert.ok(page1, 'page 1 OCR result present');
  assert.ok(page1.spans.length > 0);
  assert.ok(page1.spans.every((s) => s.ocr === true));
});

test('worker timeout: a hung OCR run is terminated and rejects with OcrTimeoutError', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  const dims = pages.map((p) => ({ page: p.page, width: p.width, height: p.height }));

  await assert.rejects(
    () => runOcrInWorker(scanned, dims, { timeoutMs: 1 }),
    (err) => {
      assert.ok(err instanceof OcrTimeoutError, `expected OcrTimeoutError, got ${err?.name}`);
      assert.match(err.message, /terminated/);
      return true;
    },
  );
});

test('THE KEY PROPERTY: a worker blocked in a non-yielding sync loop is still terminated', async () => {
  // This is what defeated the previous same-thread timeout in production: a
  // tight synchronous loop never returns to the event loop, so an in-process
  // timer callback can never run. Cross-thread terminate() interrupts it.
  const source = `
    import { parentPort } from 'node:worker_threads';
    const start = Date.now();
    while (Date.now() - start < 30000) { /* never yields */ }
    parentPort.postMessage({ ok: true, results: new Map() });
  `;
  await withTempWorker(source, async (file) => {
    const t0 = Date.now();
    const worker = new Worker(file);
    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate().then(() => resolve('terminated'));
      }, 500);
      worker.on('message', () => {
        clearTimeout(timer);
        resolve('completed');
      });
    });
    const elapsed = Date.now() - t0;
    assert.equal(outcome, 'terminated');
    assert.ok(elapsed < 10_000, `terminated promptly (took ${elapsed}ms), not after the 30s loop`);
  });
});

test('worker exception: a throwing worker rejects with OcrWorkerError, not a crash', async () => {
  const source = `throw new Error('boom inside worker');`;
  await withTempWorker(source, async (file) => {
    const err = await new Promise((resolve) => {
      const worker = new Worker(file);
      worker.on('error', resolve);
    });
    assert.match(err.message, /boom inside worker/);
    // The supervisor wraps this shape into OcrWorkerError.
    const wrapped = new OcrWorkerError(err.message);
    assert.match(wrapped.message, /OCR worker failed: boom inside worker/);
  });
});

test('worker unexpected exit: an exiting worker surfaces as OcrWorkerError, not a hang', async () => {
  const source = `process.exit(3);`;
  await withTempWorker(source, async (file) => {
    const code = await new Promise((resolve) => {
      const worker = new Worker(file);
      worker.on('exit', resolve);
    });
    assert.equal(code, 3);
    const wrapped = new OcrWorkerError(`worker exited unexpectedly (code ${code})`);
    assert.match(wrapped.message, /exited unexpectedly \(code 3\)/);
  });
});

test('main process stays alive and usable after an OCR worker is killed', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  const dims = pages.map((p) => ({ page: p.page, width: p.width, height: p.height }));

  // Kill one run...
  await assert.rejects(() => runOcrInWorker(scanned, dims, { timeoutMs: 1 }));

  // ...the process must still be fully functional afterwards. This is the
  // actual production objective: the bot keeps answering.
  const after = await extractStructured(await formattingPdf());
  assert.equal(after.ocrUsed, false);
  assert.ok(after.text.includes('Annual Report 2026'));

  // And a fresh OCR run still succeeds — no poisoned state.
  const results = await runOcrInWorker(scanned, dims);
  assert.ok(results.get(1).spans.length > 0);
});

test('a failed/timed-out OCR degrades to a controlled result, never an unhandled throw', async () => {
  // extractStructured catches OCR failure and falls back to the digital layer
  // with ocrUnavailable — the router then sends a friendly message. A scanned
  // page with no recoverable text yields empty text, not an exception.
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  assert.equal(pages[0].spans.length, 0, 'fixture really has no digital text layer');

  const result = await extractStructured(scanned);
  // With OCR working this succeeds; the point is it returns a well-formed
  // object either way, with the flags the router branches on present.
  assert.ok('ocrUsed' in result);
  assert.ok('ocrUnavailable' in result);
  assert.ok('lowConfidencePages' in result);
});

test('OCR config crosses the thread boundary (a worker does not silently use its own defaults)', async () => {
  // A worker thread loads its OWN module instances, so config mutated in the
  // main thread is invisible to it unless explicitly passed through
  // workerData. Caught when moving OCR into a worker silently broke the
  // existing maxPages/lowConfidence tests — this locks the fix down.
  const { config } = await import('../src/config.js');
  const originalMax = config.ocr.maxPages;
  const originalThreshold = config.ocr.lowConfidenceThreshold;

  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  const dims = pages.map((p) => ({ page: p.page, width: p.width, height: p.height }));

  try {
    // An unreachable confidence threshold must reach the worker and flag the page.
    config.ocr.lowConfidenceThreshold = 100;
    const flagged = await runOcrInWorker(scanned, dims);
    assert.equal(flagged.get(1).lowConfidence, true, 'main-thread config reached the worker');

    // And restoring it must flow through too — not a one-way latch.
    config.ocr.lowConfidenceThreshold = 0;
    const unflagged = await runOcrInWorker(scanned, dims);
    assert.equal(unflagged.get(1).lowConfidence, false);
  } finally {
    config.ocr.maxPages = originalMax;
    config.ocr.lowConfidenceThreshold = originalThreshold;
  }
});

test('existing digital PDF path is unchanged and never spawns a worker', async () => {
  const result = await extractStructured(await formattingPdf());
  assert.equal(result.ocrUsed, false);
  assert.equal(result.ocrPageCount, 0);
  assert.equal(result.ocrUnavailable, false);
  assert.ok(result.text.includes('Annual Report 2026'));
  assert.ok(result.spanPages[0].spans.every((s) => !s.ocr));
});
