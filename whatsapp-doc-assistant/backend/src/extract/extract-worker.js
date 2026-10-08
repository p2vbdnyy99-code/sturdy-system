// Digital span-extraction child-process entry point.
// -----------------------------------------------------------------------------
// Runs extractSpans (pdf.js getOperatorList + getTextContent over every page)
// in a separate PROCESS. That step decodes each page's embedded images, so a
// large image-heavy DIGITAL PDF can exhaust memory exactly like a scan did —
// but this path was never isolated, so it took the whole server down (silent
// kernel SIGKILL, no reply, and repeated failures got the Meta webhook
// disabled). Its own heap-capped process makes a runaway parse die here, as a
// reportable error, instead of killing the parent. See worker-supervisor.js.
import { extractSpans } from './spans.js';

process.on('message', async (msg) => {
  try {
    const { buffer, maxPages } = msg || {};
    const result = await extractSpans(Buffer.from(buffer), { maxPages });
    process.send({ ok: true, result });
  } catch (err) {
    process.send({ ok: false, error: err?.message || String(err) });
  }
  // No exit here — the parent kills the child once it has the result, which
  // avoids racing our own exit against IPC delivery of the message above.
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
