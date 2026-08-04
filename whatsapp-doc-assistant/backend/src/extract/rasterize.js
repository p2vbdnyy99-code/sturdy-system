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
  const scale = dpi / 72;
  const out = new Map();

  try {
    for (const pageNum of pageNumbers) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      out.set(pageNum, {
        png: canvas.toBuffer('image/png'),
        width: canvas.width,
        height: canvas.height,
        scale,
      });
      page.cleanup?.();
    }
    return out;
  } finally {
    await (doc.destroy?.() ?? loadingTask.destroy?.());
  }
}
