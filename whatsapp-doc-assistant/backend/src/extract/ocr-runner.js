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

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from '../logger.js';

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
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = fork(WORKER_PATH, [], {
        // 'advanced' keeps structured-clone semantics over IPC, so Buffers and
        // Maps survive intact. Default JSON serialization would balloon the
        // PDF into an array of numbers — the opposite of what we need here.
        serialization: 'advanced',
        execArgv: [`--max-old-space-size=${maxHeapMb}`],
        // Inherit stdio so the child's logs (and any V8 fatal error) show up
        // in the server's own log stream.
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
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
      // Detach handlers so the kill below can't re-settle via 'exit'.
      child.removeAllListeners();
      // SIGKILL, not SIGTERM: a child stuck in a synchronous decode loop never
      // reaches its signal handlers, so only an uncatchable signal stops it.
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      fn(value);
    };

    const timer = setTimeout(() => {
      log.warn(`OCR exceeded ${timeoutMs}ms — killing the OCR child process`);
      finish(reject, new OcrTimeoutError(timeoutMs));
    }, timeoutMs);
    timer.unref?.();

    child.on('message', (msg) => {
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

    // Failed to spawn, or the IPC channel broke.
    child.on('error', (err) => {
      finish(reject, new OcrWorkerError(err?.message || String(err)));
    });

    // Exited without a result — heap limit hit, kernel OOM-kill, or a crash.
    // This is the path that used to take the whole server down silently.
    child.on('exit', (code, signal) => {
      finish(
        reject,
        new OcrWorkerError(
          `child process exited unexpectedly (code ${code}, signal ${signal || 'none'})`,
        ),
      );
    });

    // fork() has no workerData; hand the job over once the child is up.
    try {
      child.send({ buffer, pageDims, ocrConfig: { ...config.ocr } });
    } catch (err) {
      finish(reject, new OcrWorkerError(`could not send job to child: ${err?.message || err}`));
    }
  });
}
