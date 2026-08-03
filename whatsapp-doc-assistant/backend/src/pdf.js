// PDF text extraction, with an OCR fallback for scanned documents.
// -----------------------------------------------------------------------------
// `extractText` first tries the embedded text layer via pdf-parse. If a document
// looks scanned (very little machine-readable text per page), it rasterizes the
// pages with Poppler's `pdftoppm` and runs Tesseract OCR over the images.
//
// OCR degrades gracefully: if `pdftoppm` is not installed, we return whatever
// text layer exists plus a flag so the caller can tell the user.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';
import { extractSpans, spansToText } from './extract/spans.js';

// Below this many characters of text per page, we treat the PDF as scanned.
const SCANNED_CHARS_PER_PAGE = 40;
// Cap OCR work so a huge scan can't stall the bot.
const MAX_OCR_PAGES = 15;
// Cap text-layer extraction so a many-page / "page-bomb" PDF can't pin the CPU.
// Configurable via MAX_PDF_PAGES (see config.js); default 300.
export const MAX_PDF_PAGES = config.server.maxPdfPages;

/** How many pages to actually read, given the declared count and a cap. */
export function pagesToRead(numPages, cap = MAX_PDF_PAGES) {
  const n = Number.isFinite(numPages) && numPages > 0 ? Math.floor(numPages) : 1;
  return Math.min(n, cap);
}

/**
 * Structured extraction: positioned spans (for conversion) plus a flattened
 * text view (for AI features), with a graceful OCR fallback for scans.
 * @returns {Promise<{ spanPages: Array, text: string, pageCount: number,
 *                     pagesRead: number, ocrUsed: boolean, ocrUnavailable: boolean }>}
 */
export async function extractStructured(buffer) {
  let result;
  try {
    result = await extractSpans(buffer, { maxPages: MAX_PDF_PAGES });
  } catch (err) {
    throw new Error(`Could not read PDF: ${err.message}`);
  }

  const text = spansToText(result.pages);
  const denseChars = text.replace(/\s/g, '').length;
  const looksScanned = denseChars / (result.pagesRead || 1) < SCANNED_CHARS_PER_PAGE;

  const base = {
    spanPages: result.pages,
    pageCount: result.pageCount,
    pagesRead: result.pagesRead,
  };

  if (!looksScanned) {
    return { ...base, text, ocrUsed: false, ocrUnavailable: false };
  }

  log.info(`PDF looks scanned (${denseChars} chars / ${result.pagesRead} pages) — trying OCR`);
  if (!hasPdftoppm()) {
    return { ...base, text, ocrUsed: false, ocrUnavailable: true };
  }

  try {
    // OCR currently returns text only (bounding-box OCR is the next milestone).
    const ocrText = await ocrPdf(buffer, result.pagesRead);
    const best = ocrText.length > text.length ? ocrText : text;
    return { ...base, text: best, ocrUsed: ocrText.length > text.length, ocrUnavailable: false };
  } catch (err) {
    log.warn('OCR failed, falling back to text layer:', err.message);
    return { ...base, text, ocrUsed: false, ocrUnavailable: false };
  }
}

/**
 * Back-compat text-only extraction (used by the local CLI / AI features).
 * @returns {Promise<{ text: string, pages: number, ocrUsed: boolean, ocrUnavailable: boolean }>}
 */
export async function extractText(buffer) {
  const r = await extractStructured(buffer);
  return { text: r.text, pages: r.pageCount, ocrUsed: r.ocrUsed, ocrUnavailable: r.ocrUnavailable };
}

/** Is Poppler's `pdftoppm` on PATH? Cached after first probe. */
let _pdftoppm;
function hasPdftoppm() {
  if (_pdftoppm === undefined) {
    const probe = spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    _pdftoppm = !probe.error;
    if (!_pdftoppm) {
      log.warn('`pdftoppm` (poppler-utils) not found — OCR for scanned PDFs is disabled.');
    }
  }
  return _pdftoppm;
}

/**
 * Rasterize a PDF to PNGs with `pdftoppm`, then OCR each page with Tesseract.
 * Tesseract.js is imported lazily so the (large) dependency only loads when a
 * scanned document actually shows up.
 */
async function ocrPdf(buffer, pages) {
  const { createWorker } = await import('tesseract.js');
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-ocr-'));
  const pdfPath = path.join(workDir, 'in.pdf');

  try {
    await fs.writeFile(pdfPath, buffer);

    const lastPage = Math.min(pages, MAX_OCR_PAGES);
    const render = spawnSync(
      'pdftoppm',
      ['-png', '-r', '200', '-l', String(lastPage), pdfPath, path.join(workDir, 'page')],
      { stdio: 'ignore' },
    );
    if (render.status !== 0) {
      throw new Error('pdftoppm rasterization failed');
    }

    const images = (await fs.readdir(workDir))
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(workDir, f));

    const worker = await createWorker('eng');
    try {
      const parts = [];
      for (const img of images) {
        const { data } = await worker.recognize(img);
        parts.push(data.text.trim());
      }
      return parts.join('\n\n').trim();
    } finally {
      await worker.terminate();
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
