// PDF text extraction, with a per-page OCR fallback for scanned documents.
// -----------------------------------------------------------------------------
// `extractStructured` reads the embedded text layer first (spans.js). Any PAGE
// whose text coverage is below a threshold — not the whole-document average —
// is treated as scanned and OCR'd individually, so a mixed document (some
// digital pages, some scanned) is handled correctly per page instead of
// all-or-nothing. OCR (ocr.js) produces spans in the exact same shape as the
// digital text layer, so headings/lists/tables/columns/DOCX/XLSX all work on
// OCR'd pages unmodified. OCR itself makes no AI-provider calls.

import { config } from './config.js';
import { log } from './logger.js';
import { extractSpans, spansToText } from './extract/spans.js';
import { ocrPages } from './extract/ocr.js';

// Cap text-layer extraction so a many-page / "page-bomb" PDF can't pin the CPU.
// Configurable via MAX_PDF_PAGES (see config.js); default 300.
export const MAX_PDF_PAGES = config.server.maxPdfPages;

/** How many pages to actually read, given the declared count and a cap. */
export function pagesToRead(numPages, cap = MAX_PDF_PAGES) {
  const n = Number.isFinite(numPages) && numPages > 0 ? Math.floor(numPages) : 1;
  return Math.min(n, cap);
}

/** Real (non-whitespace) character count of one page's digital text spans. */
function denseCharsOnPage(page) {
  return page.spans.reduce((sum, s) => sum + s.text.replace(/\s/g, '').length, 0);
}

/**
 * Structured extraction: positioned spans (for conversion) plus a flattened
 * text view (for AI features), with a per-page OCR fallback for scans.
 * @returns {Promise<{ spanPages: Array, text: string, pageCount: number,
 *                     pagesRead: number, ocrUsed: boolean, ocrUnavailable: boolean,
 *                     ocrPageCount: number, lowConfidencePages: number[] }>}
 */
export async function extractStructured(buffer) {
  let result;
  try {
    result = await extractSpans(buffer, { maxPages: MAX_PDF_PAGES });
  } catch (err) {
    throw new Error(`Could not read PDF: ${err.message}`);
  }

  const scannedPages = result.pages.filter((p) => denseCharsOnPage(p) < config.ocr.scannedCharsPerPage);

  const base = {
    pageCount: result.pageCount,
    pagesRead: result.pagesRead,
  };

  if (!scannedPages.length) {
    return {
      ...base,
      spanPages: result.pages,
      text: spansToText(result.pages),
      ocrUsed: false,
      ocrUnavailable: false,
      ocrPageCount: 0,
      lowConfidencePages: [],
    };
  }

  log.info(`${scannedPages.length}/${result.pagesRead} page(s) look scanned — trying OCR`);

  let ocrResults;
  try {
    ocrResults = await ocrPages(buffer, scannedPages);
  } catch (err) {
    log.warn('OCR failed, falling back to the digital text layer:', err.message);
    return {
      ...base,
      spanPages: result.pages,
      text: spansToText(result.pages),
      ocrUsed: false,
      ocrUnavailable: true,
      ocrPageCount: 0,
      lowConfidencePages: [],
    };
  }

  // Replace only the scanned pages' spans with OCR spans; digital pages are
  // untouched, so a mixed document uses the right method per page.
  const lowConfidencePages = [];
  const spanPages = result.pages.map((page) => {
    const ocr = ocrResults.get(page.page);
    if (!ocr) return page;
    if (ocr.lowConfidence) lowConfidencePages.push(page.page);
    return { ...page, spans: ocr.spans, ocr: true, ocrConfidence: ocr.avgConfidence };
  });

  return {
    ...base,
    spanPages,
    text: spansToText(spanPages),
    ocrUsed: true,
    ocrUnavailable: false,
    // ocrResults.size, not scannedPages.length: ocrPages() caps work at
    // config.ocr.maxPages, so this must reflect what actually ran, not what
    // merely looked scanned (a scanned page beyond the cap keeps its — empty
    // — digital spans rather than being OCR'd; never fabricated, just blank).
    ocrPageCount: ocrResults.size,
    lowConfidencePages,
  };
}

/**
 * Back-compat text-only extraction (used by the local CLI / AI features).
 * @returns {Promise<{ text: string, pages: number, ocrUsed: boolean, ocrUnavailable: boolean }>}
 */
export async function extractText(buffer) {
  const r = await extractStructured(buffer);
  return { text: r.text, pages: r.pageCount, ocrUsed: r.ocrUsed, ocrUnavailable: r.ocrUnavailable };
}
