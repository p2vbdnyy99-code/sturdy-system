// Intermediate document model (Phases 2+4 orchestration).
// -----------------------------------------------------------------------------
// Combines deterministic table detection with prose layout into one ordered list
// of blocks that both the DOCX renderer reads. Spans consumed by a
// high-confidence table are excluded from prose so the text isn't duplicated.
// Tables below the confidence threshold are NOT rendered as tables here — they
// fall back to normal prose flow (hard rule: never fabricate structure).

import { groupLines, proseBlocks, median, mode } from './extract/layout.js';
import { detectTables, TABLE_CONFIDENCE_MIN } from './extract/tables.js';
import { detectColumnSegments } from './extract/columns.js';

/** Single-column page (the original path — unchanged for any page where no
 *  confident column split is found). */
function buildSingleColumnBlocks(pg, bodySize) {
  const tables = detectTables(pg).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);
  const inTable = (y) => tables.some((t) => y >= t.top - 1 && y <= t.bottom + 1);
  const proseLines = groupLines(pg.spans).filter((l) => !inTable(l.y));
  const prose = proseBlocks(proseLines, bodySize);
  const tableBlocks = tables.map((t) => ({ type: 'table', table: t, y: t.top, page: pg.page }));
  return [...prose, ...tableBlocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
}

/** Column-aware page: full-width segments (headers/footers) stay normal prose
 *  (with table detection scoped to that segment); columns segments become a
 *  single 'columns' block rendered as a borderless two-cell Word table. */
function buildColumnPageBlocks(pg, bodySize, columns) {
  const allTables = detectTables(pg).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);
  const blocks = [];
  for (const seg of columns.segments) {
    if (seg.type === 'full') {
      if (!seg.lines.length) continue;
      const minY = Math.min(...seg.lines.map((l) => l.y));
      const maxY = Math.max(...seg.lines.map((l) => l.y));
      const segTables = allTables.filter((t) => t.top >= minY - 1 && t.bottom <= maxY + 1);
      const inTable = (y) => segTables.some((t) => y >= t.top - 1 && y <= t.bottom + 1);
      const prose = proseBlocks(seg.lines.filter((l) => !inTable(l.y)), bodySize);
      const tableBlocks = segTables.map((t) => ({ type: 'table', table: t, y: t.top, page: pg.page }));
      [...prose, ...tableBlocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).forEach((b) => blocks.push(b));
    } else {
      const leftBlocks = proseBlocks(seg.left, bodySize);
      const rightBlocks = proseBlocks(seg.right, bodySize);
      if (!leftBlocks.length && !rightBlocks.length) continue;
      const ys = [...seg.left, ...seg.right].map((l) => l.y);
      blocks.push({
        type: 'columns',
        columns: [leftBlocks, rightBlocks],
        widthRatios: [columns.leftWidthRatio, columns.rightWidthRatio],
        y: Math.min(...ys),
      });
    }
  }
  return blocks;
}

/** A wide, many-row 2-column table (e.g. a long price list) and a genuine
 *  sidebar page layout can look geometrically identical. When tables.js
 *  already confidently explains most of the page as such a table, that
 *  interpretation wins — it's the more specific, already-tested detector —
 *  and column-layout detection is skipped for this page. */
function hasConfidentWideTable(pg) {
  const lines = groupLines(pg.spans);
  if (!lines.length) return false;
  const tables = detectTables(pg).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);
  return tables.some((t) => t.colCount === 2 && t.rowCount >= 8 && t.rowCount >= lines.length * 0.4);
}

/** Build the ordered block model for a whole document (array of page span sets). */
export function buildDocModel(pages) {
  const sizes = [];
  for (const pg of pages) for (const s of pg.spans) if (s.text.trim()) sizes.push(s.fontSize);
  const bodySize = mode(sizes) || median(sizes) || 12;

  const blocks = [];
  pages.forEach((pg, idx) => {
    if (idx > 0) blocks.push({ type: 'pagebreak' });

    const columns = hasConfidentWideTable(pg) ? null : detectColumnSegments(pg);
    const pageBlocks = columns
      ? buildColumnPageBlocks(pg, bodySize, columns)
      : buildSingleColumnBlocks(pg, bodySize);
    pageBlocks.forEach((b) => blocks.push(b));
  });

  return { blocks, bodySize };
}
