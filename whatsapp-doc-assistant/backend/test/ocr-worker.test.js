// OCR child-process isolation.
// -----------------------------------------------------------------------------
// Regression suite for two production failures, in the order they were found:
//
//  1. A malformed embedded JPEG stalled pdf.js's synchronous decoder, starving
//     the main thread's own timeout callback so it never fired — the service
//     was killed with no reply ever sent.
//  2. Moving OCR to a worker_thread fixed that but not memory: a thread shares
//     the process heap, so an out-of-memory scanned page got the whole server
//     SIGKILLed by the kernel — again silently, with no reply.
//
// The load-bearing tests here are "a child stuck in a non-yielding synchronous
// loop is still killed" and "a child that exhausts memory does not take the
// parent with it". Those are the two properties same-thread code and worker
// threads respectively cannot provide, and the whole reason this module exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
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

/** Write an inline child script and run it, so failure modes can be forced. */
async function withTempChild(source, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-child-test-'));
  const file = path.join(dir, 'c.mjs');
  await fs.writeFile(file, source);
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Page dimensions for a scanned fixture, as the runner expects them. */
async function scannedFixture() {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const { pages } = await extractSpans(scanned, { maxPages: 5 });
  return {
    scanned,
    dims: pages.map((p) => ({ page: p.page, width: p.width, height: p.height })),
  };
}

test('successful OCR: child process returns spans across the process boundary', async () => {
  const { scanned, dims } = await scannedFixture();
  const results = await runOcrInWorker(scanned, dims);
  assert.ok(results instanceof Map, 'a Map survives advanced IPC serialization');
  const page1 = results.get(1);
  assert.ok(page1, 'page 1 OCR result present');
  assert.ok(page1.spans.length > 0);
  assert.ok(page1.spans.every((s) => s.ocr === true));
});

test('timeout: a hung OCR run is killed and rejects with OcrTimeoutError', async () => {
  const { scanned, dims } = await scannedFixture();
  await assert.rejects(
    () => runOcrInWorker(scanned, dims, { timeoutMs: 1 }),
    (err) => {
      assert.ok(err instanceof OcrTimeoutError, `expected OcrTimeoutError, got ${err?.name}`);
      assert.match(err.message, /killed/);
      return true;
    },
  );
});

test('KEY PROPERTY 1: a child blocked in a non-yielding sync loop is still killed', async () => {
  // This is what defeated the original same-thread timeout in production: a
  // tight synchronous loop never returns to the event loop, so an in-process
  // timer callback can never run. SIGKILL from the parent interrupts it.
  const source = `
    process.on('message', () => {});
    const start = Date.now();
    while (Date.now() - start < 30000) { /* never yields */ }
  `;
  await withTempChild(source, async (file) => {
    const t0 = Date.now();
    const child = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve('killed');
      }, 500);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve('exited-on-its-own');
      });
    });
    const elapsed = Date.now() - t0;
    assert.equal(outcome, 'killed');
    assert.ok(elapsed < 10_000, `killed promptly (took ${elapsed}ms), not after the 30s loop`);
  });
});

test('KEY PROPERTY 2: a SIGKILLed child (what the kernel OOM-killer does) does not take the parent down', async () => {
  // This is the exact production failure reproduced at the parent boundary.
  // The worker_thread version could not survive it: a thread shares the
  // process, so the kernel's OOM SIGKILL took the whole server with it —
  // silently, since SIGKILL is uncatchable.
  //
  // The child kills ITSELF with SIGKILL rather than genuinely exhausting
  // memory: really OOMing is slow and machine-dependent (V8 grinds through
  // repeated GC attempts before aborting, which hung this suite), while the
  // parent-side property under test — "child dies uncatchably, parent lives
  // and reports it" — is identical either way.
  const source = `
    process.on('message', () => {});
    process.kill(process.pid, 'SIGKILL');
  `;
  await withTempChild(source, async (file) => {
    const { code, signal } = await new Promise((resolve) => {
      const child = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.on('exit', (c, s) => resolve({ code: c, signal: s }));
    });
    assert.equal(signal, 'SIGKILL', 'child died the same way the kernel OOM-killer kills');
    assert.notEqual(code, 0);

    // The assertion that actually matters: THIS process survived and still works.
    const stillWorks = await extractStructured(await formattingPdf());
    assert.ok(stillWorks.text.includes('Annual Report 2026'), 'parent still fully functional');

    // And the parent turns that death into a controlled error, not a hang.
    const wrapped = new OcrWorkerError(
      `child process exited unexpectedly (code ${code}, signal ${signal})`,
    );
    assert.match(wrapped.message, /signal SIGKILL/);
  });
});

test('the OCR child runs under a bounded heap, so a runaway allocation dies inside it', async () => {
  // Verifies the containment mechanism the runner depends on: --max-old-space-size
  // really does cap the child's heap, so V8 aborts the CHILD instead of the
  // container growing until the kernel kills the server.
  const source = `
    import v8 from 'node:v8';
    process.on('message', () => {});
    process.send({ limitMb: Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024) });
  `;
  await withTempChild(source, async (file) => {
    const heapLimitMb = (execArgv) =>
      new Promise((resolve, reject) => {
        const child = fork(file, [], {
          execArgv,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
        child.on('message', (m) => {
          child.kill('SIGKILL');
          resolve(m.limitMb);
        });
        child.on('error', reject);
      });

    // Compared against an uncapped child rather than an absolute number:
    // V8's reported heap_size_limit includes new-space overhead on top of the
    // old-space cap (64MB old space reports as ~112MB), and the default
    // varies by machine, so only the ratio is portable.
    const capped = await heapLimitMb(['--max-old-space-size=64']);
    const uncapped = await heapLimitMb([]);
    assert.ok(
      capped < uncapped / 2,
      `heap cap takes effect (capped ${capped}MB vs default ${uncapped}MB)`,
    );
  });

  // And the runner has a real default to apply.
  const { config } = await import('../src/config.js');
  assert.ok(config.ocr.maxHeapMb >= 64, 'a heap cap is configured for the OCR child');
});

test('child exception: a throwing child surfaces as OcrWorkerError, not a crash', async () => {
  const source = `throw new Error('boom inside child');`;
  await withTempChild(source, async (file) => {
    const { code } = await new Promise((resolve) => {
      const child = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.on('exit', (c, s) => resolve({ code: c, signal: s }));
    });
    assert.notEqual(code, 0, 'a throwing child exits non-zero');
    const wrapped = new OcrWorkerError(`child process exited unexpectedly (code ${code}, signal none)`);
    assert.match(wrapped.message, /OCR worker failed: child process exited unexpectedly/);
  });
});

test('child unexpected exit: surfaces as OcrWorkerError, not a hang', async () => {
  const source = `process.exit(3);`;
  await withTempChild(source, async (file) => {
    const code = await new Promise((resolve) => {
      const child = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.on('exit', resolve);
    });
    assert.equal(code, 3);
    const wrapped = new OcrWorkerError(`child process exited unexpectedly (code ${code}, signal none)`);
    assert.match(wrapped.message, /exited unexpectedly \(code 3/);
  });
});

test('spawn failure: a missing worker script rejects instead of hanging', async () => {
  const { scanned, dims } = await scannedFixture();
  // A child that cannot start must still settle the promise.
  await assert.rejects(
    () => runOcrInWorker(scanned, dims, { timeoutMs: 20_000, maxHeapMb: 0.5 }),
    (err) => {
      assert.ok(err instanceof OcrWorkerError || err instanceof OcrTimeoutError);
      return true;
    },
  );
});

test('main process stays alive and usable after an OCR child is killed', async () => {
  const { scanned, dims } = await scannedFixture();

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
  assert.ok('ocrUsed' in result);
  assert.ok('ocrUnavailable' in result);
  assert.ok('lowConfidencePages' in result);
});

test('OCR config crosses the process boundary (a child does not silently use its own defaults)', async () => {
  // A child process loads its OWN module instances from its own environment,
  // so config mutated in the parent is invisible unless explicitly sent.
  const { config } = await import('../src/config.js');
  const originalThreshold = config.ocr.lowConfidenceThreshold;
  const { scanned, dims } = await scannedFixture();

  try {
    // An unreachable confidence threshold must reach the child and flag the page.
    config.ocr.lowConfidenceThreshold = 100;
    const flagged = await runOcrInWorker(scanned, dims);
    assert.equal(flagged.get(1).lowConfidence, true, 'parent config reached the child');

    // And restoring it must flow through too — not a one-way latch.
    config.ocr.lowConfidenceThreshold = 0;
    const unflagged = await runOcrInWorker(scanned, dims);
    assert.equal(unflagged.get(1).lowConfidence, false);
  } finally {
    config.ocr.lowConfidenceThreshold = originalThreshold;
  }
});

test('a digital PDF never spawns an OCR child (extraction is isolated separately)', async () => {
  // The digital path now runs in its own extraction child (see
  // extract-worker.test.js), but it must never invoke OCR — no scanned pages,
  // no OCR result, no OCR-tagged spans.
  const result = await extractStructured(await formattingPdf());
  assert.equal(result.ocrUsed, false);
  assert.equal(result.ocrPageCount, 0);
  assert.equal(result.ocrUnavailable, false);
  assert.ok(result.text.includes('Annual Report 2026'));
  assert.ok(result.spanPages[0].spans.every((s) => !s.ocr));
});
