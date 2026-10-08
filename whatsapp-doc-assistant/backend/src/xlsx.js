// Structured tables → real .xlsx (Phase 5).
// -----------------------------------------------------------------------------
// Takes detected table grids (from extract/tables.js) and writes genuine cells
// with exceljs — never space-aligned text. Each table becomes its own worksheet.
// Values are typed (number / currency / percentage / ISO date) only when the
// pattern is unambiguous; anything else stays a string. Blank cells stay blank.

import ExcelJS from 'exceljs';

const CURRENCY_RE = /^([₹$€£])\s?(-?[\d,]+(?:\.\d+)?)$/;
const PERCENT_RE = /^(-?\d+(?:\.\d+)?)\s*%$/;
const NUMBER_RE = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const CURRENCY_FMT = {
  '$': '"$"#,##0.##',
  '€': '"€"#,##0.##',
  '£': '"£"#,##0.##',
  '₹': '"₹"#,##0.##',
};

/** Convert a raw cell string into { value, numFmt?, wrap? } with confident typing. */
export function typeCell(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { value: null };
  if (s.includes('\n')) return { value: s, wrap: true };

  const cur = s.match(CURRENCY_RE);
  if (cur) {
    const n = Number(cur[2].replace(/,/g, ''));
    if (Number.isFinite(n)) return { value: n, numFmt: CURRENCY_FMT[cur[1]] || '#,##0.##' };
  }
  const pct = s.match(PERCENT_RE);
  if (pct) {
    const n = Number(pct[1]);
    if (Number.isFinite(n)) return { value: n / 100, numFmt: pct[1].includes('.') ? '0.00%' : '0%' };
  }
  const iso = s.match(ISO_DATE_RE);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (!Number.isNaN(d.getTime())) return { value: d, numFmt: 'yyyy-mm-dd' };
  }
  if (NUMBER_RE.test(s)) {
    const n = Number(s.replace(/,/g, ''));
    if (Number.isFinite(n)) return { value: n, numFmt: s.includes(',') ? '#,##0.##' : undefined };
  }
  return { value: s };
}

/**
 * Build an .xlsx Buffer from detected tables (one worksheet each).
 * @param {Array<{rows:string[][], headerBold?:boolean, confidence?:number}>} tables
 */
export async function buildXlsx(tables) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WhatsApp Document Assistant';
  wb.created = new Date();

  tables.forEach((table, ti) => {
    const ws = wb.addWorksheet(`Table ${ti + 1}`);
    const colCount = table.rows.reduce((m, r) => Math.max(m, r.length), 0);
    const widths = new Array(colCount).fill(8);

    table.rows.forEach((row, ri) => {
      const xlRow = ws.getRow(ri + 1);
      for (let c = 0; c < colCount; c += 1) {
        const { value, numFmt, wrap } = typeCell(row[c]);
        const cell = xlRow.getCell(c + 1);
        cell.value = value;
        if (numFmt) cell.numFmt = numFmt;
        if (wrap) cell.alignment = { wrapText: true, vertical: 'top' };
        if (ri === 0 && table.headerBold) cell.font = { bold: true };
        const len = value == null ? 0 : String(row[c]).length;
        widths[c] = Math.min(60, Math.max(widths[c], len + 2));
      }
      xlRow.commit?.();
    });

    ws.columns.forEach((col, i) => {
      col.width = widths[i] || 8;
    });
    if (table.headerBold) ws.views = [{ state: 'frozen', ySplit: 1 }];
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
