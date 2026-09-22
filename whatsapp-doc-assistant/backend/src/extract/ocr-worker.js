// OCR child-process entry point.
// -----------------------------------------------------------------------------
// Runs rasterization + Tesseract OCR in a separate PROCESS so the server can
// survive whatever happens here. See ocr-runner.js for the full rationale: a
// same-thread timeout could not interrupt a stuck synchronous decode, and a
// worker_thread shared the process heap so an out-of-memory page SIGKILLed the
// whole server. Its own process gives this work an isolated heap and a kill
// switch the parent can actually use.
//
// Scoped narrowly: only OCR (rasterize + Tesseract) runs here. The digital
// PDF extraction path is untouched and stays in the main process.
import { ocrPages } from './ocr.js';

process.on('message', async (msg) => {
  try {
    // ocrConfig is passed in rather than read from this process's own config
    // module: a child loads its own module instances from its own environment,
    // so runtime changes made in the parent would otherwise be invisible here.
    const { buffer, pageDims, ocrConfig } = msg || {};
    const results = await ocrPages(Buffer.from(buffer), pageDims, ocrConfig);
    process.send({ ok: true, results });
  } catch (err) {
    process.send({ ok: false, error: err?.message || String(err) });
  }
  // Deliberately no exit here — the parent kills this process once it has the
  // result, which avoids racing our own exit against IPC delivery.
});

// A failure that escapes the handler must still produce a reply rather than a
// silent death the parent can only infer from an exit code.
process.on('uncaughtException', (err) => {
  try {
    process.send?.({ ok: false, error: `uncaught: ${err?.message || err}` });
  } catch {
    /* channel already gone — the parent's 'exit' handler covers this */
  }
});
