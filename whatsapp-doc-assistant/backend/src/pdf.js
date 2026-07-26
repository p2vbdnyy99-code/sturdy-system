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
// Import the library entrypoint directly to avoid pdf-parse's debug harness,
// which tries to read a bundled sample file when imported as the package root.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { log } from './logger.js';

// Below this many characters of text per page, we treat the PDF as scanned.
const SCANNED_CHARS_PER_PAGE = 40;
// Cap OCR work so a huge scan can't stall the bot.
const MAX_OCR_PAGES = 15;

/**
 * Extract text from a PDF buffer.
 * @returns {Promise<{ text: string, pages: number, ocrUsed: boolean, ocrUnavailable: boolean }>}
 */
export async function extractText(buffer) {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    throw new Error(`Could not read PDF: ${err.message}`);
  }

  const pages = parsed.numpages || 1;
  const text = (parsed.text || '').trim();
  const looksScanned = text.length / pages < SCANNED_CHARS_PER_PAGE;

  if (!looksScanned) {
    return { text, pages, ocrUsed: false, ocrUnavailable: false };
  }

  log.info(`PDF looks scanned (${text.length} chars / ${pages} pages) — trying OCR`);
  if (!hasPdftoppm()) {
    return { text, pages, ocrUsed: false, ocrUnavailable: true };
  }

  try {
    const ocrText = await ocrPdf(buffer, pages);
    // Prefer OCR output when it clearly recovered more content.
    const best = ocrText.length > text.length ? ocrText : text;
    return { text: best, pages, ocrUsed: ocrText.length > text.length, ocrUnavailable: false };
  } catch (err) {
    log.warn('OCR failed, falling back to text layer:', err.message);
    return { text, pages, ocrUsed: false, ocrUnavailable: false };
  }
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
