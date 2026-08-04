// Deterministic PDF fixtures for the conversion test suite.
// -----------------------------------------------------------------------------
// Each helper builds a PDF Buffer in memory with pdfkit so tests assert against
// known content and geometry. No files are written; nothing is networked.

import PDFDocument from 'pdfkit';

/** Render a pdfkit document (via the callback) to a Buffer. */
export function buildPdf(draw, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, ...opts });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Heading + paragraphs + bold/italic + a big/small size contrast. */
export function formattingPdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(24).text('Annual Report 2026');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(16).text('Executive Summary');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).text(
      'Revenue grew strongly this year across all regions and product lines.',
    );
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).text('This line is bold.');
    doc.font('Helvetica-Oblique').fontSize(11).text('This line is italic.');
  });
}

/** A ruled table drawn with lines: header + two data rows, numeric cells. */
export function ruledTablePdf() {
  return buildPdf((doc) => {
    const startX = 60;
    const startY = 80;
    const colW = [120, 80, 80, 80];
    const rowH = 24;
    const headers = ['Product', 'Q1', 'Q2', 'Q3'];
    const rows = [
      ['Product A', '100', '120', '140'],
      ['Product B', '80', '90', '110'],
    ];
    const grid = [headers, ...rows];
    const totalW = colW.reduce((a, b) => a + b, 0);

    // Ruling lines.
    doc.lineWidth(0.8);
    for (let r = 0; r <= grid.length; r += 1) {
      const y = startY + r * rowH;
      doc.moveTo(startX, y).lineTo(startX + totalW, y).stroke();
    }
    let cx = startX;
    for (let c = 0; c <= colW.length; c += 1) {
      doc.moveTo(cx, startY).lineTo(cx, startY + grid.length * rowH).stroke();
      cx += colW[c] || 0;
    }
    // Cell text.
    for (let r = 0; r < grid.length; r += 1) {
      let x = startX + 5;
      for (let c = 0; c < headers.length; c += 1) {
        doc.font(r === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(11)
          .text(String(grid[r][c]), x, startY + r * rowH + 7, { lineBreak: false });
        x += colW[c];
      }
    }
  });
}

/** A borderless table: aligned columns, no ruling lines. Mixed value types. */
export function borderlessTablePdf() {
  return buildPdf((doc) => {
    const startX = 60;
    let y = 90;
    const cols = [60, 200, 300, 400];
    const grid = [
      ['Item', 'Price', 'Growth', 'Date'],
      ['Widget', '$1,200', '15%', '2026-01-31'],
      ['Gadget', '$980', '8%', '2026-02-15'],
    ];
    for (const row of grid) {
      for (let c = 0; c < row.length; c += 1) {
        doc.font(y === 90 ? 'Helvetica-Bold' : 'Helvetica').fontSize(11)
          .text(row[c], cols[c], y, { lineBreak: false });
      }
      y += 22;
    }
  });
}

/** A plain prose paragraph, no tables, so table detection must find nothing. */
export function proseOnlyPdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica').fontSize(12).text(
      'This document is ordinary prose with no tabular content whatsoever. ' +
        'It exists to confirm that the table detector does not hallucinate a ' +
        'grid where none is present, and instead reports low confidence.',
      { width: 400 },
    );
  });
}

/** Two bullet items crammed onto one visual line (CV "core competencies" style
 *  layout), where the LEFT item wraps to a second line. Regression fixture for
 *  the multi-bullet-line split + x-proximity continuation matching. */
export function twoColumnBulletsPdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(14).text('CORE COMPETENCIES', 60, 60, { lineBreak: false });
    doc.font('Helvetica').fontSize(11);
    doc.text('• Ophthalmic Imaging Interpretation (OCT, Fundus,', 60, 90, { lineBreak: false });
    doc.text('• AI Dataset Annotation & Clinical Validation', 350, 90, { lineBreak: false });
    doc.text('Perimetry)', 60, 104, { lineBreak: false });
    doc.text('• Glaucoma Diagnosis, Management & Research', 60, 130, { lineBreak: false });
    doc.text('• Clinical Workflow Design for AI Training', 350, 130, { lineBreak: false });
  });
}

/** A wrapped single bullet item followed by a second bullet item — regression
 *  fixture for continuation lines reattaching to the list item, not becoming
 *  an orphan unindented paragraph. */
export function wrappedBulletPdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text('WORK EXPERIENCE', 60, 60, { lineBreak: false });
    doc.font('Helvetica').fontSize(11);
    doc.text('• Independently perform cataract surgeries and assist in complex', 64, 90, { lineBreak: false });
    doc.text('ophthalmic procedures, documenting findings in structured records.', 74, 104, { lineBreak: false });
    doc.text('• Diagnose and manage high-volume anterior segment pathologies.', 64, 130, { lineBreak: false });
  });
}

/** A genuine two-column page (sidebar + main body) sustained across many rows,
 *  the pattern the column-layout detector must find (unlike the coincidental
 *  two-bullets-per-line case above, which stays single-column prose). */
export function sidebarColumnsPdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(18).text('Jane Doe', 60, 40, { lineBreak: false });
    doc.font('Helvetica').fontSize(10);
    // Real column content: each side wraps independently at its own column
    // width, so line y-positions between the two sides do NOT line up row for
    // row (unlike a data table's uniform grid) — the realistic signature of a
    // page layout rather than tabular data.
    doc.text(
      'CONTACT\njane@example.com\n+1 555 0100\nCity, Country\n\nSKILLS\nLeadership\nCommunication\nPlanning\nAnalysis\nTeam Building\nBudgeting\nNegotiation\n\nLANGUAGES\nEnglish\nSpanish',
      60,
      90,
      { width: 130, lineGap: 2 },
    );
    doc.text(
      'PROFESSIONAL SUMMARY\nExperienced manager with a proven track record of delivering measurable results across multiple cross-functional teams and departments in fast-paced environments.\n\nWORK EXPERIENCE\nSenior Manager, Acme Corp\nLed cross-functional initiatives that improved operational efficiency and business outcomes. Managed budgets, stakeholders, and a team of twelve direct reports across three regional offices.\n\nJunior Manager, Beta Inc\nCoordinated daily operations and supported senior leadership on strategic planning tasks.',
      220,
      90,
      { width: 320, lineGap: 2 },
    );
  });
}

/** Two pages, so multi-page handling / page boundaries can be checked. */
export function twoPagePdf() {
  return buildPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(18).text('Page One Title');
    doc.font('Helvetica').fontSize(12).text('Content of the first page.');
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(18).text('Page Two Title');
    doc.font('Helvetica').fontSize(12).text('Content of the second page.');
  });
}
