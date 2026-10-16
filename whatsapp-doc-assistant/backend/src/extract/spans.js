// Structured PDF span extraction (Phase 1 of the conversion engine).
// -----------------------------------------------------------------------------
// Turns a digital PDF into positioned text spans instead of flattened text.
// Each span keeps the geometry and font information pdf.js already computes but
// the old pipeline discarded: position, size, font, and bold/italic. This is the
// shared intermediate representation that both the DOCX and XLSX renderers read.
//
// Coordinates are normalized to a top-down system (y grows downward, origin
// top-left) so line/row clustering is natural. Bold/italic come from the real
// font object in pdf.js `commonObjs` (populated by getOperatorList), with a
// name-based fallback. Nothing here calls the network or an LLM.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

function round(n, p = 1) {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

/** Resolve a font's real name + bold/italic, cached per page by fontName. */
function fontInfo(page, fontName, cache) {
  if (cache.has(fontName)) return cache.get(fontName);
  let info = { name: '', bold: false, italic: false };
  try {
    const f = page.commonObjs.get(fontName);
    if (f) info = { name: f.name || '', bold: Boolean(f.bold || f.black), italic: Boolean(f.italic) };
  } catch {
    /* font not resolved into commonObjs — fall through to name heuristics */
  }
  // Fallback: infer from the PostScript name when flags are missing.
  if (!info.bold && /bold|black|heavy|semibold/i.test(info.name)) info.bold = true;
  if (!info.italic && /italic|oblique/i.test(info.name)) info.italic = true;
  cache.set(fontName, info);
  return info;
}

/** Map a PDF font name to a plausible Word font family (drop style suffixes). */
export function fontFamily(name) {
  if (!name) return '';
  // Strip subset prefix "ABCDEF+" and style suffix after '-' or ','.
  const base = String(name).replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0];
  return base.trim();
}

/**
 * Extract positioned spans from a PDF buffer.
 * @returns {Promise<{ pages: Array<{page:number,width:number,height:number,spans:Array}>,
 *                     pageCount:number, pagesRead:number, truncated:boolean }>}
 */
export async function extractSpans(buffer, { maxPages = 300 } = {}) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  try {
    const pageCount = doc.numPages || 1;
    const pagesRead = Math.min(Math.max(1, Math.floor(pageCount)), maxPages);
    const pages = [];

    for (let p = 1; p <= pagesRead; p += 1) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const height = viewport.height;
      const fontCache = new Map();

      // getOperatorList populates commonObjs so bold/italic is resolvable, and
      // lets us count path/stroke ops as a coarse "ruled table" signal (used
      // only to *boost* table-detection confidence, never as sole evidence).
      const opList = await page.getOperatorList();
      const { OPS } = pdfjs;
      let rulesLike = 0;
      for (const fn of opList.fnArray) {
        if (fn === OPS.stroke || fn === OPS.rectangle || fn === OPS.constructPath) rulesLike += 1;
      }
      const tc = await page.getTextContent();

      const spans = [];
      for (const it of tc.items) {
        if (typeof it.str !== 'string' || it.str === '') continue;
        const fi = fontInfo(page, it.fontName, fontCache);

        // Symbol fonts (ZapfDingbats/Wingdings/Symbol) encode glyphs on ordinary
        // letters — e.g. a bullet renders as "n". Normalize a symbol glyph to a
        // real bullet and drop symbol whitespace so lists read correctly.
        let text = it.str;
        if (/dingbat|wingding|symbol/i.test(fi.name)) {
          if (!text.trim()) continue;
          text = '•';
        }

        const t = it.transform; // [a,b,c,d,e,f]
        const size = it.height || Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 0;
        spans.push({
          text,
          x: round(t[4], 2),
          y: round(height - t[5], 2), // top-down baseline
          w: round(it.width || 0, 2),
          h: round(size, 2),
          fontSize: round(size),
          fontName: fi.name || String(it.fontName || ''),
          bold: fi.bold,
          italic: fi.italic,
          page: p,
          hasEOL: Boolean(it.hasEOL),
        });
      }

      pages.push({
        page: p,
        width: round(viewport.width, 2),
        height: round(height, 2),
        spans,
        rulesLike,
      });
      page.cleanup?.();
    }

    return { pages, pageCount, pagesRead, truncated: pageCount > pagesRead };
  } finally {
    await (doc.destroy?.() ?? loadingTask.destroy?.());
  }
}

/** Flatten spans back to plain text (reading order) for AI features / summaries. */
export function spansToText(pages) {
  const out = [];
  for (const pg of pages) {
    const sorted = [...pg.spans].sort((a, b) => a.y - b.y || a.x - b.x);
    let lineY = null;
    let line = [];
    // Sort each finished line by x before joining. For digital PDF text this
    // is a no-op (spans on one line already share an exact baseline y, so the
    // initial (y, x) sort already leaves them in reading order) — but OCR
    // word boxes have natural per-word y jitter, which the initial sort keys
    // on FIRST, silently scrambling word order within a line without this.
    const flush = () => {
      if (line.length) out.push([...line].sort((a, b) => a.x - b.x).map((s) => s.text).join(' '));
      line = [];
    };
    for (const s of sorted) {
      if (lineY === null || Math.abs(s.y - lineY) > Math.max(3, 0.5 * s.h)) {
        flush();
        lineY = s.y;
      }
      line.push(s);
    }
    flush();
    out.push(''); // blank line between pages
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
