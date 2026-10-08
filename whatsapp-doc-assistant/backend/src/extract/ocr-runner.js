// OCR subprocess supervision — owns the timeout and can actually kill the work.
// -----------------------------------------------------------------------------
// Runs ocr-worker.js as a separate CHILD PROCESS (not a worker thread) and
// supervises it. Two production failures drove this design, in order:
//
//  1. A same-thread `Promise.race` timeout could not interrupt pdf.js's pure-JS
//     JPEG decoder stuck in a long synchronous loop — the timer callback never
//     got a turn to run, so no reply was ever sent.
//  2. Moving that work to a worker_thread fixed the CPU case but not memory: a
//     thread shares the process heap, so a scanned page that exhausted the
//     container's memory got the whole server SIGKILLed by the kernel. A
//     SIGKILL is uncatchable — no error, no log line, no reply.
//
// A child process has its own heap and its own OS process identity, so:
//   * `--max-old-space-size` bounds it, and blowing that limit kills the CHILD
//     with a reportable non-zero exit instead of taking the server with it;
//   * if the kernel does OOM-kill, it targets the largest process — the child —
//     and the parent survives to send a friendly error;
//   * SIGKILL from the parent interrupts a stuck synchronous loop outright.
//
// Honest limit: `--max-old-space-size` caps V8's heap, not native allocations
// (@napi-rs/canvas bitmaps, the Tesseract WASM runtime). Those can still grow
// past it. The process boundary is what makes that survivable, not the flag.
//
// Every failure mode resolves to a normal rejection the router already knows
// how to turn into a friendly message. The main process must survive whatever
// happens in the child — that is the actual objective here.

import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { superviseChild } from './worker-supervisor.js';

const WORKER_PATH = fileURLToPath(new URL('./ocr-worker.js', import.meta.url));

/** Error marking an OCR run that was killed for exceeding its time budget. */
export class OcrTimeoutError extends Error {
  constructor(ms) {
    super(`OCR timed out after ${ms}ms and the child process was killed`);
    this.name = 'OcrTimeoutError';
  }
}

/** Error for a child that failed, crashed, or returned something unusable. */
export class OcrWorkerError extends Error {
  constructor(message) {
    super(`OCR worker failed: ${message}`);
    this.name = 'OcrWorkerError';
  }
}

/**
 * Run OCR in an isolated, killable child process.
 * @param {Buffer} buffer PDF bytes.
 * @param {Array<{page:number,width:number,height:number}>} pageDims
 * @param {{timeoutMs?: number, maxHeapMb?: number}} [opts]
 * @returns {Promise<Map<number, {spans: Array, avgConfidence: number, lowConfidence: boolean}>>}
 */
export function runOcrInWorker(
  buffer,
  pageDims,
  { timeoutMs = config.ocr.timeoutMs, maxHeapMb = config.ocr.maxHeapMb } = {},
) {
  return superviseChild(
    WORKER_PATH,
    { buffer, pageDims, ocrConfig: { ...config.ocr } },
    {
      timeoutMs,
      maxHeapMb,
      label: 'OCR',
      timeoutError: (ms) => new OcrTimeoutError(ms),
      workerError: (msg) => new OcrWorkerError(msg),
      parse: (msg) => {
        if (!(msg.results instanceof Map)) throw new Error('worker returned a malformed result');
        return msg.results;
      },
    },
  );
}
