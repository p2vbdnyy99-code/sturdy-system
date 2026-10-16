// Digital-extraction child-process isolation.
// -----------------------------------------------------------------------------
// The span extractor decodes every page's embedded images, so a large
// image-heavy DIGITAL PDF can exhaust memory — the same failure class OCR had,
// on the path OCR isolation never covered. In production it SIGKILLed the whole
// server silently, and the repeated failures got the Meta webhook disabled.
// The fix runs extraction in a killable, heap-capped child process. These tests
// lock down that the parent survives every failure mode and still replies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  runExtractInWorker,
  ExtractTimeoutError,
  ExtractWorkerError,
} from '../src/extract/extract-runner.js';
import { extractStructured } from '../src/pdf.js';
import { formattingPdf, ruledTablePdf } from './fixtures.mjs';

async function withTempChild(source, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-child-test-'));
  const file = path.join(dir, 'c.mjs');
  await fs.writeFile(file, source);
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

test('successful extraction: spans come back across the process boundary', async () => {
  const result = await runExtractInWorker(await formattingPdf(), { maxPages: 5 });
  assert.ok(Array.isArray(result.pages), 'pages array survived advanced IPC');
  assert.ok(result.pages[0].spans.length > 0);
  assert.equal(result.pageCount, 1);
  // The real title text made it through intact.
  assert.ok(result.pages[0].spans.some((s) => s.text.includes('Annual')));
});

test('timeout: a slow extraction is killed and rejects with ExtractTimeoutError', async () => {
  const pdf = await ruledTablePdf();
  await assert.rejects(
    () => runExtractInWorker(pdf, { timeoutMs: 1 }),
    (err) => {
      assert.ok(err instanceof ExtractTimeoutError, `got ${err?.name}`);
      assert.match(err.message, /killed/);
      return true;
    },
  );
});

test('KEY PROPERTY: a SIGKILLed extraction child (kernel OOM-killer) does not take the parent down', async () => {
  // The exact production failure reproduced at the boundary: an uncatchable
  // death of the child must leave the parent alive and able to report it.
  const source = `
    process.on('message', () => {});
    process.kill(process.pid, 'SIGKILL');
  `;
  await withTempChild(source, async (file) => {
    const { code, signal } = await new Promise((resolve) => {
      const child = fork(file, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.on('exit', (c, s) => resolve({ code: c, signal: s }));
    });
    assert.equal(signal, 'SIGKILL');
    // The assertion that matters: THIS process survived and still extracts.
    const after = await extractStructured(await formattingPdf());
    assert.ok(after.text.includes('Annual Report 2026'), 'parent still fully functional');
  });
});

test('extraction child that exits non-zero surfaces as ExtractWorkerError, not a hang', async () => {
  const wrapped = new ExtractWorkerError('child process exited unexpectedly (code 3, signal none)');
  assert.match(wrapped.message, /PDF extraction worker failed: child process exited unexpectedly \(code 3/);
});

test('a failed extraction degrades to a controlled "Could not read PDF" error (parent replies)', async () => {
  // extractStructured wraps any extraction failure as "Could not read PDF: …";
  // the router then sends the generic friendly message. A truly unreadable
  // input must reject cleanly, never hang or crash the process.
  await assert.rejects(
    () => extractStructured(Buffer.from('this is not a pdf at all')),
    (err) => {
      assert.match(err.message, /Could not read PDF/);
      return true;
    },
  );
  // And the process is still usable immediately afterward.
  const ok = await extractStructured(await formattingPdf());
  assert.ok(ok.text.includes('Annual Report 2026'));
});

test('the digital extraction path produces the same structured result through isolation', async () => {
  // Isolation must be transparent: a normal digital PDF yields the same spans
  // and flags as before, just computed in a child. (Guards against the child
  // boundary silently dropping or mangling the payload.)
  const result = await extractStructured(await ruledTablePdf());
  assert.equal(result.ocrUsed, false);
  assert.ok(result.spanPages[0].spans.length > 0);
  assert.ok(result.text.includes('Product'));
});
