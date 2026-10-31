// Deterministic table detection (Phase 4).
// -----------------------------------------------------------------------------
// Reconstructs table grids from span geometry — NOT from an LLM and NOT from
// whitespace-in-a-string. Primary evidence is x-coordinate column clustering and
// y-row clustering; the ruling-line signal (rulesLike from spans.js) only boosts
// confidence. Every detected table carries a confidence score; the caller must
// treat a low score as "no reliable table" and fall back rather than emit a
// fabricated grid (hard product rule).

import { groupLines, median } from './layout.js';

// A table is only offered to the user at/above this confidence.
export const TABLE_CONFIDENCE_MIN = 0.7;

/** Split a line's spans into cells wherever the x-gap is clearly > a word space. */
function segmentCells(line) {
  const gapThreshold = Math.max(10, 1.4 * line.fontSize);
  const cells = [];
  let cur = null;
  for (const s of line.spans) {
    if (!cur || s.x - cur.xEnd > gapThreshold) {
      cur = { x: s.x, xEnd: s.x + s.w, spans: [s] };
      cells.push(cur);
    } else {
      cur.xEnd = Math.max(cur.xEnd, s.x + s.w);
      cur.spans.push(s);
    }
  }
  for (const c of cells) {
    // Preserve within-cell spacing using x-gaps (multiline handled at row level).
    let prev = null;
    c.text = c.spans
      .map((s) => {
        const sp = prev && s.x - (prev.x + prev.w) > 0.25 * s.fontSize ? ' ' : '';
        prev = s;
        return sp + s.text;
      })
      .join('')
      .trim();
    c.bold = c.spans.every((s) => s.bold);
  }
  return cells;
}

/** Assign a cell x to an existing column bucket or create a new one. */
function assignColumn(columns, x, tol) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < columns.length; i += 1) {
    const d = Math.abs(columns[i].x - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0 && bestD <= tol) {
    const col = columns[best];
    col.x = (col.x * col.n + x) / (col.n + 1); // running mean
    col.n += 1;
    return best;
  }
  columns.push({ x, n: 1 });
  return columns.length - 1;
}

/**
 * Detect tables on a single page.
 * @returns Array<{ page, rows: string[][], colCount, rowCount, headerBold,
 *                  confidence, ruled }>
 */
export function detectTables(page) {
  const lines = groupLines(page.spans);
  if (lines.length < 2) return [];

  // Candidate rows = lines that split into >= 2 cells.
  const rows = lines.map((l) => ({ line: l, cells: segmentCells(l) }));

  // Group consecutive multi-cell lines into regions.
  const regions = [];
  let cur = null;
  for (const r of rows) {
    if (r.cells.length >= 2) {
      if (!cur) {
        cur = [];
        regions.push(cur);
      }
      cur.push(r);
    } else {
      cur = null;
    }
  }

  const tables = [];
  for (const region of regions) {
    if (region.length < 2) continue;
    const table = buildTable(region, page.rulesLike || 0);
    if (table) tables.push({ page: page.page, ...table });
  }
  return tables;
}

function buildTable(region, rulesLike) {
  const fontSizes = region.flatMap((r) => r.cells.map((c) => c.spans[0]?.fontSize || 12));
  const tol = Math.max(10, 0.9 * (median(fontSizes) || 12));

  // Build column buckets from all cells (in row order).
  const columns = [];
  const assignments = region.map((r) => r.cells.map((c) => assignColumn(columns, c.x, tol)));
  const order = columns
    .map((c, i) => ({ i, x: c.x }))
    .sort((a, b) => a.x - b.x);
  const remap = new Map(order.map((o, newIdx) => [o.i, newIdx]));
  const colCount = columns.length;
  if (colCount < 2) return null;

  // Assemble the grid; track collisions (two cells landing in one column).
  let collisions = 0;
  let filledRows = 0;
  const grid = region.map((r, ri) => {
    const cellsByCol = new Array(colCount).fill('');
    const seen = new Set();
    let hits = 0;
    r.cells.forEach((c, ci) => {
      const col = remap.get(assignments[ri][ci]);
      if (seen.has(col)) {
        collisions += 1;
        cellsByCol[col] = `${cellsByCol[col]} ${c.text}`.trim();
      } else {
        cellsByCol[col] = c.text;
        seen.add(col);
        hits += 1;
      }
    });
    if (hits >= 2) filledRows += 1;
    return cellsByCol;
  });

  const rowCount = grid.length;
  const regularity = filledRows / rowCount; // rows that used >=2 distinct columns
  const collisionPenalty = collisions / (rowCount * colCount);
  let confidence = Math.max(0, regularity - collisionPenalty);
  // Ruling lines around a region are strong evidence of a real table.
  const ruled = rulesLike >= colCount + rowCount;
  if (ruled) confidence = Math.min(1, confidence + 0.15);

  // Reject list/prose columns masquerading as a table (hard rule: prefer a
  // fallback over a fabricated grid). Real data cells are short; a two-column
  // bulleted list or wrapped-prose columns have long cells and/or bullets.
  const cellTexts = grid.flat().filter((c) => c && c.trim());
  const avgCellLen = cellTexts.reduce((a, c) => a + c.length, 0) / (cellTexts.length || 1);
  const bulletCells = cellTexts.filter((c) => /^\s*[•·▪◦‣]/.test(c)).length;
  if (!ruled && (avgCellLen > 25 || bulletCells >= 2)) return null;

  const headerBold = region[0].cells.every((c) => c.bold) && region[0].cells.length >= 2;
  const top = region[0].line.y;
  const lastLine = region[region.length - 1].line;
  const bottom = lastLine.y + lastLine.h;

  return {
    rows: grid,
    colCount,
    rowCount,
    headerBold,
    confidence: Math.round(confidence * 100) / 100,
    ruled,
    top,
    bottom,
  };
}

/** Detect tables across all pages; optionally merge a table continuing to the
 *  next page (same column count + aligned, no repeated header). */
export function detectTablesAcrossPages(pages) {
  const perPage = pages.map((pg) => detectTables(pg));
  const all = [];
  for (let p = 0; p < perPage.length; p += 1) {
    for (const t of perPage[p]) all.push(t);
  }
  // Conservative continuation merge: a table that is the last on its page and a
  // table that is the first on the very next page with the same column count.
  const merged = [];
  for (let i = 0; i < all.length; i += 1) {
    const t = all[i];
    const next = all[i + 1];
    if (
      next &&
      next.page === t.page + 1 &&
      next.colCount === t.colCount &&
      t.confidence >= TABLE_CONFIDENCE_MIN &&
      next.confidence >= TABLE_CONFIDENCE_MIN
    ) {
      // Append next's rows (drop a repeated header row if identical).
      let rows = next.rows;
      if (t.headerBold && rows.length && rows[0].join('|') === t.rows[0].join('|')) {
        rows = rows.slice(1);
      }
      merged.push({ ...t, rows: [...t.rows, ...rows], rowCount: t.rowCount + rows.length, spannedPages: [t.page, next.page] });
      i += 1; // consumed next
    } else {
      merged.push(t);
    }
  }
  return merged;
}
