// Digital span-extraction supervision — isolate the heavy pdf.js parse.
// -----------------------------------------------------------------------------
// Runs extract-worker.js as a killable, heap-capped child process and returns
// the span pages, so a memory blow-up on a large image-heavy digital PDF dies
// in the child instead of SIGKILLing the server. This closes the gap the OCR
// isolation left open: only the scanned path was protected; the digital parse
// still ran in the main process. Shares the supervision mechanics with OCR via
// worker-supervisor.js.

import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { superviseChild } from './worker-supervisor.js';

const WORKER_PATH = fileURLToPath(new URL('./extract-worker.js', import.meta.url));

/** Killed for exceeding its time budget. */
export class ExtractTimeoutError extends Error {
  constructor(ms) {
    super(`PDF extraction timed out after ${ms}ms and the child process was killed`);
    this.name = 'ExtractTimeoutError';
  }
}

/** The extraction child failed, crashed (e.g. OOM), or returned junk. */
export class ExtractWorkerError extends Error {
  constructor(message) {
    super(`PDF extraction worker failed: ${message}`);
    this.name = 'ExtractWorkerError';
  }
}

/**
 * Extract positioned spans in an isolated, killable child process.
 * @param {Buffer} buffer PDF bytes.
 * @param {{maxPages?: number, timeoutMs?: number, maxHeapMb?: number}} [opts]
 * @returns {Promise<{pages:Array, pageCount:number, pagesRead:number, truncated:boolean}>}
 */
export function runExtractInWorker(
  buffer,
  {
    maxPages = config.server.maxPdfPages,
    timeoutMs = config.extract.timeoutMs,
    maxHeapMb = config.extract.maxHeapMb,
  } = {},
) {
  return superviseChild(
    WORKER_PATH,
    { buffer, maxPages },
    {
      timeoutMs,
      maxHeapMb,
      label: 'PDF extraction',
      timeoutError: (ms) => new ExtractTimeoutError(ms),
      workerError: (msg) => new ExtractWorkerError(msg),
      parse: (msg) => {
        if (!msg.result || !Array.isArray(msg.result.pages)) {
          throw new Error('worker returned a malformed result');
        }
        return msg.result;
      },
    },
  );
}
