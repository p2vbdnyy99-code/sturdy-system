// OCR for scanned PDF pages — produces the SAME span shape as spans.js.
// -----------------------------------------------------------------------------
// This is the key architectural move: OCR does not get its own document
// converter. It rasterizes pages (rasterize.js), runs Tesseract.js, and maps
// each recognized word's pixel bounding box back into PDF-point space as a
// span identical in shape to a digital text span — so the existing
// heading/list/table/column detection and DOCX/XLSX renderers work on OCR'd
// pages completely unmodified.
//
// Runs no AI provider calls (no OpenAI/Anthropic) — OCR is local, deterministic
// recognition only. AI features (summarize, Q&A, translate) run afterward, on
// whatever text this module produces, exactly as they would for a digital PDF.

import { config } from '../config.js';
import { log } from '../logger.js';
import { rasterizePages } from './rasterize.js';

function round(n, p = 1) {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

/** Convert one Tesseract word into a span in PDF-point space. */
function wordToSpan(word, page, scale) {
  const { x0, y0, x1, y1 } = word.bbox;
  const h = (y1 - y0) / scale;
  return {
    text: word.text,
    x: round(x0 / scale, 2),
    y: round(y0 / scale, 2), // top-down, matching spans.js's convention
    w: round((x1 - x0) / scale, 2),
    h: round(h, 2),
    fontSize: round(h),
    fontName: word.font_name || '',
    bold: Boolean(word.is_bold),
    italic: Boolean(word.is_italic),
    page,
    hasEOL: false,
    ocr: true,
    confidence: round(word.confidence, 1),
  };
}

/**
 * OCR a single rasterized page image, returning spans + average confidence.
 * @param {import('tesseract.js').Worker} worker A started Tesseract worker.
 */
async function ocrImage(worker, imagePng, pageNum, scale) {
  const { data } = await worker.recognize(imagePng);
  const words = (data.words || []).filter((w) => w.text && w.text.trim());
  const spans = words.map((w) => wordToSpan(w, pageNum, scale));
  const avgConfidence = words.length
    ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
    : 0;
  return { spans, avgConfidence: round(avgConfidence, 1) };
}

/**
 * OCR the given pages of a PDF and return spans in the shared span format.
 * @param {Buffer} buffer PDF bytes.
 * @param {Array<{page:number, width:number, height:number}>} pageDims Page
 *        dimensions in PDF points (from extractSpans), so OCR'd spans line up
 *        with any digital pages in the same document.
 * @param {object} [ocrConfig] Resolved OCR settings. Passed explicitly because
 *        this runs in a worker thread, which loads its OWN module instances —
 *        a `config` object mutated in the main thread would not be visible
 *        here, so the caller sends its effective config across the boundary.
 * @returns {Promise<Map<number, {spans: Array, avgConfidence: number, lowConfidence: boolean}>>}
 */
export async function ocrPages(buffer, pageDims, ocrConfig = config.ocr) {
  const pageNumbers = pageDims.map((p) => p.page).slice(0, ocrConfig.maxPages);
  if (!pageNumbers.length) return new Map();

  const { createWorker } = await import('tesseract.js');
  const rasters = await rasterizePages(buffer, pageNumbers, ocrConfig.dpi);

  const worker = await createWorker('eng');
  const results = new Map();
  try {
    for (const pageNum of pageNumbers) {
      const raster = rasters.get(pageNum);
      if (!raster) continue;
      try {
        const { spans, avgConfidence } = await ocrImage(worker, raster.png, pageNum, raster.scale);
        const lowConfidence = avgConfidence < ocrConfig.lowConfidenceThreshold;
        if (lowConfidence) {
          log.warn(`OCR page ${pageNum}: low confidence (${avgConfidence}) — flagging for the caller`);
        }
        results.set(pageNum, { spans, avgConfidence, lowConfidence });
      } catch (err) {
        log.warn(`OCR failed on page ${pageNum}: ${err.message}`);
        results.set(pageNum, { spans: [], avgConfidence: 0, lowConfidence: true });
      }
    }
  } finally {
    await worker.terminate();
  }
  return results;
}
