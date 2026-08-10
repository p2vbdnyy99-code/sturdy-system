// Layout-complexity assessment — decide when to WARN rather than silently ship.
// -----------------------------------------------------------------------------
// The structured converter reconstructs single- and two-column documents well,
// but a professionally designed 3+ column / desktop-publishing layout squeezes
// multiple independent vertical flows through a model that assumes at most one
// gutter, so reading order interleaves. We do NOT try to fix every such layout
// (that is an open-ended PDF layout-analysis problem). We DETECT it cheaply and
// deterministically, so the caller can tell the user the truth instead of
// handing them confident nonsense.
//
// Everything here is geometry only — no AI, no network, no document content
// retained beyond counts.

import { groupLines } from './layout.js';

// A line-start x-cluster this far apart (points) is treated as a distinct column.
const COLUMN_TOL = 24;
// A cluster must hold at least this share of a page's lines to count as a real
// column (filters out stray indents, one-off centered titles, etc.).
const MIN_COLUMN_SHARE = 0.12;
const MIN_COLUMN_LINES = 3;

/** Cluster SPAN-start x-positions into columns; return the significant ones.
 *  Uses individual span x — NOT line-start x — because groupLines merges spans
 *  from several columns into one visual line, so every line's start collapses
 *  to the leftmost column and hides the real column structure. */
function columnClusters(spans, lineCount) {
  const xs = spans.map((s) => s.x).sort((a, b) => a - b);
  const clusters = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.mean <= COLUMN_TOL) {
      last.xs.push(x);
      last.mean = last.xs.reduce((s, v) => s + v, 0) / last.xs.length;
    } else {
      clusters.push({ xs: [x], mean: x });
    }
  }
  // A real column carries a meaningful share of the page's lines' worth of
  // spans — measured against line count so a single wrapped paragraph (many
  // spans, one x) doesn't masquerade as its own column.
  const threshold = Math.max(MIN_COLUMN_LINES, Math.ceil(lineCount * MIN_COLUMN_SHARE));
  return clusters.filter((c) => c.xs.length >= threshold).sort((a, b) => a.mean - b.mean);
}

/** Fraction of lines whose spans straddle two or more column boundaries — the
 *  direct signature of interleaving risk (one visual line pulls text from
 *  several columns, which reading-by-line then scrambles). */
function crossColumnRatio(lines, columnMeans) {
  if (columnMeans.length < 2) return 0;
  // Midpoints between adjacent column starts act as boundaries.
  const bounds = [];
  for (let i = 1; i < columnMeans.length; i += 1) {
    bounds.push((columnMeans[i - 1] + columnMeans[i]) / 2);
  }
  let crossing = 0;
  for (const line of lines) {
    const spansAcross = bounds.some((b) => line.x < b && line.xEnd > b);
    if (spansAcross) crossing += 1;
  }
  return crossing / lines.length;
}

/**
 * Assess one document's layout complexity.
 * @param {Array<{spans:Array}>} spanPages
 * @returns {{ complex: boolean, columnCount: number, crossColumnRatio: number,
 *             reason: string }}
 */
export function assessLayout(spanPages) {
  let maxColumns = 1;
  let worstCross = 0;

  for (const page of spanPages || []) {
    const realSpans = (page.spans || []).filter((s) => s.text && s.text.trim());
    const lines = groupLines(page.spans).filter((l) => l.spans.length);
    if (lines.length < 6) continue; // too sparse to judge; assume simple
    const clusters = columnClusters(realSpans, lines.length);
    const cols = Math.max(1, clusters.length);
    const cross = crossColumnRatio(lines, clusters.map((c) => c.mean));
    if (cols > maxColumns) maxColumns = cols;
    if (cross > worstCross) worstCross = cross;
  }

  // Trigger ONLY on 3+ real columns — that is the layout class beyond the
  // single-gutter model, where columns collapse together and reading order
  // scrambles. One- and two-column documents (including sidebar CVs and
  // newsletters, where a high cross-column ratio is normal and correctly
  // handled by the gutter splitter) stay UNflagged so we don't cry wolf on
  // the layouts the converter already does well. crossColumnRatio is retained
  // as an instrumentation signal, not a trigger.
  const complex = maxColumns >= 3;
  const reason = complex ? `${maxColumns}-column layout` : 'simple';

  return {
    complex,
    columnCount: maxColumns,
    crossColumnRatio: Math.round(worstCross * 100) / 100,
    reason,
  };
}
