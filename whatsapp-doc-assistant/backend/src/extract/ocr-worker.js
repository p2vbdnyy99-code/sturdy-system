// OCR worker-thread entry point.
// -----------------------------------------------------------------------------
// Runs rasterization + Tesseract OCR in an isolated OS thread so the main
// process can forcibly terminate it if it hangs. This exists because a
// same-thread `Promise.race` timeout was proven insufficient in production: a
// malformed embedded JPEG stalled pdf.js's pure-JS decoder in a long
// synchronous loop that never yielded back to the event loop, so the main
// thread's own timer callback never got a turn to run and the process was
// eventually killed with no reply ever sent. A worker thread runs on its own
// OS thread; V8's cross-thread terminate() (ocr-runner.js calls
// `worker.terminate()`) can interrupt that same stuck loop from the outside,
// which same-thread code fundamentally cannot do to itself.
//
// Scoped narrowly: only OCR (rasterize + Tesseract) runs here. The digital
// PDF extraction path is untouched and stays in the main process.
import { parentPort, workerData } from 'node:worker_threads';
import { ocrPages } from './ocr.js';

async function run() {
  try {
    // ocrConfig is passed in rather than read from this thread's own config
    // module: a worker loads fresh module instances, so runtime changes made
    // in the main thread would otherwise be invisible here.
    const { buffer, pageDims, ocrConfig } = workerData;
    const results = await ocrPages(Buffer.from(buffer), pageDims, ocrConfig);
    parentPort.postMessage({ ok: true, results });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err?.message || String(err) });
  }
}

run();
