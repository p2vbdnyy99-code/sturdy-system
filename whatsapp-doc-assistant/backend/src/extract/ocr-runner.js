// OCR worker supervision — owns the timeout and can actually kill the work.
// -----------------------------------------------------------------------------
// Spawns ocr-worker.js on its own OS thread and supervises it. The key
// property (which the previous same-thread `Promise.race` timeout could not
// provide): on timeout we call `worker.terminate()`, which V8 honors even when
// the worker is stuck inside a long synchronous loop — e.g. pdf.js's pure-JS
// JPEG decoder grinding on a malformed embedded image, the exact production
// failure that killed the service with no reply sent.
//
// Every failure mode resolves to a normal rejection the router already knows
// how to turn into a friendly message. The main process must survive whatever
// happens in the worker — that is the actual objective here.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from '../logger.js';

const WORKER_PATH = fileURLToPath(new URL('./ocr-worker.js', import.meta.url));

/** Error marking an OCR run that was killed for exceeding its time budget. */
export class OcrTimeoutError extends Error {
  constructor(ms) {
    super(`OCR timed out after ${ms}ms and the worker was terminated`);
    this.name = 'OcrTimeoutError';
  }
}

/** Error for a worker that failed, crashed, or returned something unusable. */
export class OcrWorkerError extends Error {
  constructor(message) {
    super(`OCR worker failed: ${message}`);
    this.name = 'OcrWorkerError';
  }
}

/**
 * Run OCR in an isolated, terminable worker thread.
 * @param {Buffer} buffer PDF bytes.
 * @param {Array<{page:number,width:number,height:number}>} pageDims
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<Map<number, {spans: Array, avgConfidence: number, lowConfidence: boolean}>>}
 */
export function runOcrInWorker(buffer, pageDims, { timeoutMs = config.ocr.timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(WORKER_PATH, {
        // Send the effective OCR config across the thread boundary — the
        // worker's own config module instance is separate from this one.
        workerData: { buffer, pageDims, ocrConfig: { ...config.ocr } },
      });
    } catch (err) {
      reject(new OcrWorkerError(err?.message || String(err)));
      return;
    }

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Detach handlers so a terminate()-triggered 'exit' can't re-settle.
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
      fn(value);
    };

    const timer = setTimeout(() => {
      log.warn(`OCR exceeded ${timeoutMs}ms — terminating the worker thread`);
      finish(reject, new OcrTimeoutError(timeoutMs));
    }, timeoutMs);
    timer.unref?.();

    worker.on('message', (msg) => {
      if (msg?.ok) {
        if (!(msg.results instanceof Map)) {
          finish(reject, new OcrWorkerError('worker returned a malformed result'));
          return;
        }
        finish(resolve, msg.results);
      } else {
        finish(reject, new OcrWorkerError(msg?.error || 'unknown worker error'));
      }
    });

    // The worker threw before it could report back.
    worker.on('error', (err) => {
      finish(reject, new OcrWorkerError(err?.message || String(err)));
    });

    // Exited without a result — OOM, a hard crash, or process.exit() inside.
    worker.on('exit', (code) => {
      finish(reject, new OcrWorkerError(`worker exited unexpectedly (code ${code})`));
    });
  });
}
