// Intermediate document model (Phases 2+4 orchestration).
// -----------------------------------------------------------------------------
// Combines deterministic table detection with prose layout into one ordered list
// of blocks that both the DOCX renderer reads. Spans consumed by a
// high-confidence table are excluded from prose so the text isn't duplicated.
// Tables below the confidence threshold are NOT rendered as tables here — they
// fall back to normal prose flow (hard rule: never fabricate structure).

import { groupLines, proseBlocks, median, mode } from './extract/layout.js';
import { detectTables, TABLE_CONFIDENCE_MIN } from './extract/tables.js';

/** Build the ordered block model for a whole document (array of page span sets). */
export function buildDocModel(pages) {
  const sizes = [];
  for (const pg of pages) for (const s of pg.spans) if (s.text.trim()) sizes.push(s.fontSize);
  const bodySize = mode(sizes) || median(sizes) || 12;

  const blocks = [];
  pages.forEach((pg, idx) => {
    if (idx > 0) blocks.push({ type: 'pagebreak' });

    const tables = detectTables(pg).filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN);

    // Prose from lines NOT inside any high-confidence table's y-range.
    const inTable = (y) => tables.some((t) => y >= t.top - 1 && y <= t.bottom + 1);
    const proseLines = groupLines(pg.spans).filter((l) => !inTable(l.y));
    const prose = proseBlocks(proseLines, bodySize);

    const tableBlocks = tables.map((t) => ({ type: 'table', table: t, y: t.top, page: pg.page }));

    // Merge prose + tables in vertical reading order.
    [...prose, ...tableBlocks].sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).forEach((b) => blocks.push(b));
  });

  return { blocks, bodySize };
}
