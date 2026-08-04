// PDF page rasterization for OCR — pure Node, no system binary.
// -----------------------------------------------------------------------------
// Renders PDF pages to PNG buffers using pdf.js + @napi-rs/canvas (a prebuilt
// native addon shipped over npm, not an apt package). This deliberately
// replaces an earlier `pdftoppm` (Poppler)-based approach: Poppler is a system
// binary that isn't installable on Render's free tier, which meant OCR was
// silently unavailable in production. @napi-rs/canvas installs like any other
// npm dependency, so this works in the same environment the app deploys to.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Render one or more pages of a PDF to PNG image buffers.
 * @param {Buffer} buffer PDF file bytes.
 * @param {number[]} pageNumbers 1-based page numbers to render.
 * @param {number} dpi Target resolution (72 dpi == PDF's native point scale).
 * @returns {Promise<Map<number, {png: Buffer, width: number, height: number, scale: number}>>}
 *          scale is pixels-per-PDF-point, needed to map OCR pixel coordinates
 *          back to the PDF's own coordinate space.
 */
export async function rasterizePages(buffer, pageNumbers, dpi) {
  const renderer = await openForRasterizing(buffer);
  const out = new Map();
  try {
    for (const pageNum of pageNumbers) {
      out.set(pageNum, await renderer.renderPage(pageNum, dpi));
    }
    return out;
  } finally {
    await renderer.close();
  }
}

/**
 * Open a PDF once and render pages ON DEMAND, one at a time.
 *
 * This exists because rendering every page up front was a production OOM: a
 * scanned document's pages are photographs, and a single 3000x4000 source
 * image decodes to tens of megabytes before it is even scaled. Holding all of
 * them simultaneously — alongside the Tesseract WASM runtime — exceeded the
 * container's memory limit and the kernel SIGKILLed the process, which is
 * uncatchable: no error, no log, no reply to the user. Streaming keeps peak
 * usage at roughly ONE page instead of the whole batch.
 *
 * The caller is responsible for calling `close()`.
 * @param {Buffer} buffer PDF file bytes.
 */
export async function openForRasterizing(buffer) {
  // Lazy import: @napi-rs/canvas ships prebuilt native binaries per platform.
  // On an unsupported platform this throws — we want that to surface as
  // "OCR unavailable" for this request, not crash the whole server at boot.
  const { createCanvas } = await import('@napi-rs/canvas');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  return {
    pageCount: doc.numPages || 0,

    /** Render one page to PNG. Page resources are released before returning
     *  so the next call starts from a clean baseline. */
    async renderPage(pageNum, dpi) {
      const scale = dpi / 72;
      const page = await doc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        return {
          png: canvas.toBuffer('image/png'),
          width: canvas.width,
          height: canvas.height,
          scale,
        };
      } finally {
        // Drops this page's decoded image data — without it pdf.js retains
        // every rendered page's bitmap for the document's lifetime.
        page.cleanup?.();
      }
    },

    async close() {
      await (doc.destroy?.() ?? loadingTask.destroy?.());
    },
  };
}
