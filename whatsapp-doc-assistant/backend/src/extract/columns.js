// Column layout detection (native Word reconstruction, replacing the
// floating-frame "Keep Layout" experiment — see docx-layout.js header comment).
// -----------------------------------------------------------------------------
// Detects a genuine side-by-side two-column region (e.g. a CV sidebar next to
// the main body) from span geometry, WITHOUT touching single-column documents.
// The signal is a clean vertical gutter: an x-position with a real gap that
// many lines respect — either confined entirely to one side, or split cleanly
// across both — sustained over a large share of the page. Callers should only
// use this when tables.js hasn't already claimed the region as a wide table
// (docmodel.js enforces that ordering); this module only judges geometry.

import { groupLines, median } from './layout.js';

const FULL_WIDTH_RATIO = 0.75; // a line this wide (of content width) can't be a column line
const MIN_SIDE_LINES = 4; // each side needs independently-wrapping content, not a coincidence
const MIN_TOTAL_LINES = 15; // don't attempt column detection on sparse pages
const MIN_HEIGHT_COVERAGE = 0.35; // matched lines must span a real portion of the page
const GX_STEP = 4; // pt granularity when scanning for the gutter

/** Classify one line against a candidate gutter x.
 *  'left'/'right': entirely on one side. 'concurrent': cleanly split, real
 *  content on both sides (strong column evidence). 'cross': a span itself
 *  straddles gx — can't split here, and not usable as evidence. */
function classifyAt(line, gx, tol) {
  let hasLeft = false;
  let hasRight = false;
  for (const s of line.spans) {
    if (s.x + s.w <= gx + tol) hasLeft = true;
    else if (s.x >= gx - tol) hasRight = true;
    else return 'cross';
  }
  if (hasLeft && hasRight) return 'concurrent';
  return hasLeft ? 'left' : 'right';
}

/** Find the best gutter x for a set of "narrow" lines, or null if no strong signal. */
function findGutter(narrowLines, contentLeft, contentRight) {
  let best = null;
  for (let gx = contentLeft + 0.15 * (contentRight - contentLeft); gx <= contentLeft + 0.75 * (contentRight - contentLeft); gx += GX_STEP) {
    let left = 0;
    let right = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const line of narrowLines) {
      const cls = classifyAt(line, gx, 2);
      if (cls === 'cross') continue;
      if (cls === 'left' || cls === 'concurrent') left += 1;
      if (cls === 'right' || cls === 'concurrent') right += 1;
      if (cls !== 'cross') {
        minY = Math.min(minY, line.y);
        maxY = Math.max(maxY, line.y);
      }
    }
    if (left < MIN_SIDE_LINES || right < MIN_SIDE_LINES) continue;
    const score = left + right;
    if (!best || score > best.score) best = { gx, left, right, score, minY, maxY };
  }
  if (!best) return null;

  // Snap the coarse grid value to the actual whitespace gap: the stepped gx
  // that won the search can land inside a short span the search didn't score
  // against (e.g. a wide line excluded from narrowLines, or simply an
  // unlucky step). Recompute the true gap from the winning classification so
  // later per-line tagging never straddles real text.
  let maxLeftEdge = -Infinity;
  let minRightEdge = Infinity;
  for (const line of narrowLines) {
    const cls = classifyAt(line, best.gx, 2);
    if (cls === 'cross') continue;
    for (const s of line.spans) {
      if (s.x + s.w <= best.gx + 2) maxLeftEdge = Math.max(maxLeftEdge, s.x + s.w);
      else if (s.x >= best.gx - 2) minRightEdge = Math.min(minRightEdge, s.x);
    }
  }
  if (Number.isFinite(maxLeftEdge) && Number.isFinite(minRightEdge) && minRightEdge > maxLeftEdge) {
    best.gx = (maxLeftEdge + minRightEdge) / 2;
  }
  return best;
}

/** Build a synthetic "line" object from a subset of spans (for the half of a
 *  concurrent line that falls on one side of the gutter). */
function fragmentFromSpans(spans) {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  return {
    y: sorted[0].y,
    spans: sorted,
    x: Math.min(...sorted.map((s) => s.x)),
    xEnd: Math.max(...sorted.map((s) => s.x + s.w)),
    h: Math.max(...sorted.map((s) => s.h)),
    fontSize: median(sorted.map((s) => s.fontSize)),
    bold: sorted.every((s) => s.bold),
    page: sorted[0].page,
  };
}

/**
 * Detect a two-column layout on one page and split it into ordered segments.
 * @param {{spans: Array}} page
 * @returns {{segments: Array<{type:'full', lines: Array} | {type:'columns', left: Array, right: Array}>,
 *            leftWidthRatio: number, rightWidthRatio: number} | null}
 *          null when no confident column split is found (caller should use the
 *          existing single-column path unchanged).
 */
export function detectColumnSegments(page) {
  const lines = groupLines(page.spans);
  if (lines.length < MIN_TOTAL_LINES) return null;

  const contentLeft = Math.min(...lines.map((l) => l.x));
  const contentRight = Math.max(...lines.map((l) => l.xEnd));
  const contentWidth = contentRight - contentLeft;
  if (contentWidth < 150) return null;

  const narrowLines = lines.filter((l) => l.xEnd - l.x <= FULL_WIDTH_RATIO * contentWidth);
  if (narrowLines.length < MIN_TOTAL_LINES * 0.5) return null;

  const gutter = findGutter(narrowLines, contentLeft, contentRight);
  if (!gutter) return null;

  const totalHeight = Math.max(...lines.map((l) => l.y)) - Math.min(...lines.map((l) => l.y)) || 1;
  const coverage = (gutter.maxY - gutter.minY) / totalHeight;
  if (coverage < MIN_HEIGHT_COVERAGE) return null;

  // Classify every line against the winning gutter. Unlike the narrow-line
  // pre-filter used above (a search-time optimization), a line's raw x-extent
  // alone must NOT force it to 'full' here: a short left snippet next to a
  // long right-column line legitimately spans most of the page width but
  // still splits cleanly at the gutter — classifyAt already handles that via
  // 'concurrent'. Only an actual straddling span ('cross') means it can't be
  // split, so it stays full-width prose (e.g. a real title or full-width row).
  const tagged = lines.map((line) => {
    const cls = classifyAt(line, gutter.gx, 2);
    return { line, side: cls === 'cross' ? 'full' : cls };
  });

  // Group consecutive lines into full-width segments and columns segments.
  const segments = [];
  let cur = null;
  for (const t of tagged) {
    const kind = t.side === 'full' ? 'full' : 'columns';
    if (!cur || cur.kind !== kind) {
      cur = { kind, items: [] };
      segments.push(cur);
    }
    cur.items.push(t);
  }

  const out = segments.map((seg) => {
    if (seg.kind === 'full') return { type: 'full', lines: seg.items.map((t) => t.line) };
    const left = [];
    const right = [];
    for (const t of seg.items) {
      if (t.side === 'left') left.push(t.line);
      else if (t.side === 'right') right.push(t.line);
      else if (t.side === 'concurrent') {
        const leftSpans = t.line.spans.filter((s) => s.x + s.w <= gutter.gx + 2);
        const rightSpans = t.line.spans.filter((s) => s.x >= gutter.gx - 2);
        if (leftSpans.length) left.push(fragmentFromSpans(leftSpans));
        if (rightSpans.length) right.push(fragmentFromSpans(rightSpans));
      }
    }
    return { type: 'columns', left, right };
  });

  // Require at least one real columns segment (guards against edge cases where
  // every matched line ended up reclassified as full after the wide-line check).
  if (!out.some((s) => s.type === 'columns' && s.left.length && s.right.length)) return null;

  const leftWidth = gutter.gx - contentLeft;
  const rightWidth = contentRight - gutter.gx;
  return { segments: out, leftWidthRatio: leftWidth / contentWidth, rightWidthRatio: rightWidth / contentWidth };
}
