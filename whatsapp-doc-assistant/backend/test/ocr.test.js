// OCR regression suite for scanned PDFs.
// -----------------------------------------------------------------------------
// Each "scanned" fixture is a REAL image-only PDF built by rasterizing a
// digital fixture and re-embedding it with no text layer (toScannedPdf), so
// these tests exercise the actual rasterize -> Tesseract -> span pipeline —
// not a mock. Tesseract recognition is slow (seconds per page); this file is
// deliberately kept to a small, high-signal set rather than one case per
// document type (the structural/layout variety is already covered by
// regression-matrix.test.js against digital PDFs — OCR reuses that same
// pipeline once spans exist, so it doesn't need its own copy of every case).
//
// Known gap, not covered here: rotated scans. Tesseract's orientation
// detection needs extra configuration this milestone deliberately left out
// (see the plan: "make scanned PDFs reliably readable first, don't solve
// layout reconstruction in the same milestone"). A rotated scan will currently
// produce degraded, not corrected, text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpans } from '../src/extract/spans.js';
import { extractStructured } from '../src/pdf.js';
import { buildDocModel } from '../src/docmodel.js';
import { buildDocx } from '../src/docx.js';
import { config } from '../src/config.js';
import { formattingPdf, sidebarColumnsPdf, twoPagePdf, toScannedPdf } from './fixtures.mjs';

test('clean scanned document: text recovered via OCR, spans tagged, no AI calls needed', async () => {
  const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
  const result = await extractStructured(scanned);

  assert.equal(result.ocrUsed, true);
  assert.equal(result.ocrPageCount, 1);
  assert.ok(result.text.includes('Annual Report 2026'));
  assert.ok(result.text.includes('Executive Summary'));
  assert.ok(result.text.includes('This line is bold.'));
  assert.ok(result.spanPages[0].spans.every((s) => s.ocr === true));
  assert.deepEqual(result.lowConfidencePages, []);
});

test('scanned CV-style layout: OCR spans still flow through columns/headings/DOCX unmodified', async () => {
  const scanned = await toScannedPdf(await sidebarColumnsPdf(), { dpi: 150 });
  const result = await extractStructured(scanned);

  assert.equal(result.ocrUsed, true);
  // Lenient completeness threshold: OCR is not pixel-perfect, but the bulk of
  // the recognizable words (short section labels, real English sentences)
  // should come through.
  const srcWords = 'Jane Doe CONTACT SKILLS PROFESSIONAL SUMMARY WORK EXPERIENCE'.split(' ');
  const hits = srcWords.filter((w) => result.text.includes(w));
  assert.ok(hits.length >= srcWords.length * 0.6, `recognized too few section labels: ${JSON.stringify(hits)}`);

  // The existing pipeline — unmodified — must accept OCR spans without throwing.
  const model = buildDocModel(result.spanPages);
  const buf = await buildDocx(model, {});
  assert.equal(Buffer.from(buf).slice(0, 2).toString('latin1'), 'PK');
});

test('mixed digital + scanned document: digital page untouched, scanned page OCR-tagged', async () => {
  const digitalTwoPage = await twoPagePdf();
  const { pages: digitalPages } = await extractSpans(digitalTwoPage, { maxPages: 5 });
  assert.equal(digitalPages.length, 2);

  // Build a mixed PDF: page 1 stays digital text, page 2 becomes a scanned
  // image, by rasterizing only page 2 and reassembling with pdfkit.
  const { rasterizePages } = await import('../src/extract/rasterize.js');
  const PDFDocument = (await import('pdfkit')).default;
  const raster = (await rasterizePages(digitalTwoPage, [2], 150)).get(2);

  const mixedBuf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(18).text('Page One Title');
    // Long enough to clear the per-page scanned-text threshold (config.ocr.
    // scannedCharsPerPage, ~40 dense chars) — a short line would itself look
    // "scanned" and defeat the point of this mixed-document test.
    doc.font('Helvetica').fontSize(12).text(
      'Content of the first page, with enough real text on it to clear the ' +
        'per-page scanned-document detection threshold used elsewhere.',
    );
    doc.addPage({ size: [digitalPages[1].width, digitalPages[1].height], margin: 0 });
    doc.image(raster.png, 0, 0, { width: digitalPages[1].width, height: digitalPages[1].height });
    doc.end();
  });

  const result = await extractStructured(mixedBuf);
  assert.equal(result.ocrUsed, true);
  assert.equal(result.ocrPageCount, 1, 'only the scanned page should be OCR\'d');
  assert.ok(result.spanPages[0].spans.every((s) => !s.ocr), 'page 1 (digital) must stay untouched');
  assert.ok(result.spanPages[1].spans.every((s) => s.ocr === true), 'page 2 (scanned) must be OCR-tagged');
  assert.ok(result.text.includes('Page One Title'));
  assert.ok(result.text.includes('Page Two Title'));
});

test('existing digital PDF: OCR is never invoked', async () => {
  const result = await extractStructured(await formattingPdf());
  assert.equal(result.ocrUsed, false);
  assert.equal(result.ocrPageCount, 0);
});

test('oversized scanned document: OCR work is capped, not unbounded', async () => {
  const original = config.ocr.maxPages;
  config.ocr.maxPages = 1;
  try {
    const digitalThreePage = await (async () => {
      const PDFDocument = (await import('pdfkit')).default;
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        for (let i = 0; i < 3; i += 1) {
          if (i > 0) doc.addPage();
          doc.font('Helvetica').fontSize(14).text(`Page ${i + 1} content here.`);
        }
        doc.end();
      });
    })();
    const scanned = await toScannedPdf(digitalThreePage, { dpi: 120 });
    const result = await extractStructured(scanned);
    assert.equal(result.ocrPageCount, 1, 'capped to config.ocr.maxPages, not all 3 pages');
  } finally {
    config.ocr.maxPages = original;
  }
});

test('low-confidence OCR is flagged, not silently trusted (safety layer)', async () => {
  const original = config.ocr.lowConfidenceThreshold;
  config.ocr.lowConfidenceThreshold = 100; // impossible to reach — forces the flag
  try {
    const scanned = await toScannedPdf(await formattingPdf(), { dpi: 150 });
    const result = await extractStructured(scanned);
    assert.deepEqual(result.lowConfidencePages, [1]);
  } finally {
    config.ocr.lowConfidenceThreshold = original;
  }
});

test('OCR makes zero AI-provider calls (no OpenAI/Anthropic SDK imports in the OCR path)', async () => {
  const fs = await import('node:fs/promises');
  const ocrSrc = await fs.readFile(new URL('../src/extract/ocr.js', import.meta.url), 'utf8');
  const rasterSrc = await fs.readFile(new URL('../src/extract/rasterize.js', import.meta.url), 'utf8');
  // Check actual import specifiers, not prose (this file's own doc comment
  // names both providers to explain their absence — that's not a call site).
  const importRe = /(?:from|import\()\s*['"](openai|@anthropic-ai\/sdk)['"]/i;
  for (const src of [ocrSrc, rasterSrc]) {
    assert.ok(!importRe.test(src), 'OCR modules must not import an AI provider SDK');
  }
});
