// Layout analysis (Phase 2): positioned spans → structured prose blocks.
// -----------------------------------------------------------------------------
// Groups spans into lines (y-clustering), lines into paragraphs, and classifies
// headings by *relative font size / weight* (not text length), plus basic list
// and alignment detection. Table regions are handled separately (tables.js) and
// stitched in by docmodel.js — this module only produces prose blocks.

export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function mode(nums) {
  const counts = new Map();
  let best = null;
  let bestN = 0;
  for (const n of nums) {
    const c = (counts.get(n) || 0) + 1;
    counts.set(n, c);
    if (c > bestN) {
      bestN = c;
      best = n;
    }
  }
  return best;
}

/** Cluster spans into visual lines by baseline y. Drops whitespace-only spans. */
export function groupLines(spans) {
  const real = spans.filter((s) => s.text && s.text.trim() !== '');
  const sorted = [...real].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const s of sorted) {
    const line = lines[lines.length - 1];
    if (!line || Math.abs(s.y - line.y) > Math.max(3, 0.5 * s.h)) {
      lines.push({ y: s.y, spans: [s] });
    } else {
      line.spans.push(s);
    }
  }
  for (const line of lines) {
    line.spans.sort((a, b) => a.x - b.x);
    line.x = line.spans[0].x;
    line.xEnd = Math.max(...line.spans.map((s) => s.x + s.w));
    line.h = Math.max(...line.spans.map((s) => s.h));
    line.fontSize = median(line.spans.map((s) => s.fontSize));
    line.bold = line.spans.every((s) => s.bold);
    line.page = line.spans[0].page;
  }
  return lines;
}

/** Merge a line's spans into formatting-homogeneous runs, spacing by x-gaps. */
function lineToRuns(line) {
  const runs = [];
  let prev = null;
  for (const s of line.spans) {
    const gap = prev ? s.x - (prev.x + prev.w) : 0;
    const needSpace = prev && gap > 0.25 * s.fontSize && !/\s$/.test(prev.text) && !/^\s/.test(s.text);
    const key = `${s.bold}|${s.italic}|${s.fontSize}|${s.fontName}`;
    const last = runs[runs.length - 1];
    const text = (needSpace ? ' ' : '') + s.text;
    if (last && last.key === key) {
      last.text += text;
    } else {
      runs.push({ key, text, bold: s.bold, italic: s.italic, fontSize: s.fontSize, fontName: s.fontName });
    }
    prev = s;
  }
  return runs.map(({ key, ...r }) => r); // drop the merge key
}

const BULLET_RE = /^\s*([•·▪◦‣–\-*])\s+/;
const ORDERED_RE = /^\s*(\d{1,3}|[a-zA-Z])[.)]\s+/;

function detectList(line) {
  const t = line.spans.map((s) => s.text).join(' ');
  if (BULLET_RE.test(t)) return { ordered: false, marker: t.match(BULLET_RE)[1] };
  if (ORDERED_RE.test(t)) return { ordered: true, marker: t.match(ORDERED_RE)[1] };
  return null;
}

/** Split a visual line into x-gap-separated segments (same heuristic used by
 *  tables.js/segmentCells and docx-layout.js/segments: a gap wider than a
 *  normal word space). Used to detect two list items crammed onto one visual
 *  line — a common CV pattern (a two-column bullet block within an otherwise
 *  single-column page, e.g. "• Skill one    • Skill two"). */
function splitLineSegments(line) {
  const gap = Math.max(14, 1.4 * (line.fontSize || 12));
  const segs = [];
  let cur = null;
  for (const s of line.spans) {
    if (!cur || s.x - cur.xEnd > gap) {
      cur = { x: s.x, xEnd: s.x + s.w, spans: [s] };
      segs.push(cur);
    } else {
      cur.xEnd = Math.max(cur.xEnd, s.x + s.w);
      cur.spans.push(s);
    }
  }
  return segs;
}

/** If every segment of a line starts with its own bullet/ordered marker, this
 *  is multiple list items on one visual line, not one item with a wide gap. */
function detectMultiListLine(line) {
  const segs = splitLineSegments(line);
  if (segs.length < 2) return null;
  const items = segs.map((seg) => ({ seg, list: detectList({ spans: seg.spans }) }));
  if (!items.every((it) => it.list)) return null;
  return items;
}

/** Basic alignment from line position within the page's text column. */
function alignOf(line, left, right) {
  const width = right - left;
  if (width <= 0) return 'left';
  const leftGap = line.x - left;
  const rightGap = right - line.xEnd;
  const lineWidth = line.xEnd - line.x;
  if (lineWidth < width * 0.85 && Math.abs(leftGap - rightGap) < width * 0.08 && leftGap > width * 0.1) {
    return 'center';
  }
  if (rightGap < width * 0.05 && leftGap > width * 0.25) return 'right';
  return 'left';
}

/** Build prose blocks (headings, paragraphs, list items) for one page's lines. */
export function proseBlocks(lines, bodySize) {
  if (!lines.length) return [];
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.xEnd));

  // Heading detection: primarily relative font size, but also promote short
  // bold / ALL-CAPS lines (common section headers that share the body size).
  const headingLevel = (line) => {
    const r = line.fontSize / (bodySize || 12);
    if (r >= 1.6) return 1;
    if (r >= 1.3) return 2;
    if (r >= 1.15) return 3;
    const text = line.spans.map((s) => s.text).join(' ').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    const allCaps = /[A-Za-z]/.test(text) && text === text.toUpperCase();
    if (line.bold && words <= 6 && (r >= 1.05 || allCaps)) return allCaps ? 2 : 3;
    return 0;
  };

  const blocks = [];
  let para = null;
  // List items eligible to absorb a wrapped continuation line, each tagged
  // with its x-range. A single-bullet line has one; a multi-bullet line (two
  // columns of bullets on one visual row) has one per column, so a wrapped
  // continuation is matched to the item nearest its own x, not just "the last
  // one pushed" — otherwise a left-column wrap can attach to the right column.
  let openListItems = [];
  const flushPara = () => {
    if (para) blocks.push(para);
    para = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = lines[i - 1];
    const gap = prev ? line.y - prev.y : 0;
    const lineHeight = line.h || bodySize;

    const multi = detectMultiListLine(line);
    if (multi) {
      flushPara();
      openListItems = [];
      for (const { seg, list } of multi) {
        const item = {
          type: 'listitem',
          ordered: list.ordered,
          runs: lineToRuns({ spans: seg.spans }),
          page: line.page,
          y: line.y,
        };
        blocks.push(item);
        openListItems.push({ item, x: seg.x, xEnd: seg.xEnd });
      }
      continue;
    }

    const list = detectList(line);
    const level = list ? 0 : headingLevel(line);
    const align = alignOf(line, left, right);
    const runs = lineToRuns(line);

    if (level > 0) {
      flushPara();
      openListItems = [];
      blocks.push({ type: 'heading', level, runs, align, page: line.page, y: line.y });
      continue;
    }
    if (list) {
      flushPara();
      const item = { type: 'listitem', ordered: list.ordered, runs, page: line.page, y: line.y };
      blocks.push(item);
      openListItems = [{ item, x: line.x, xEnd: line.xEnd }];
      continue;
    }
    // A wrapped continuation of a previous list item (no bullet of its own,
    // follows closely, no paragraph already open) stays part of that item
    // instead of becoming a disconnected, unindented paragraph. Matched by
    // x-proximity so a multi-bullet line's wrap reattaches to the right column.
    if (openListItems.length && !para && gap <= 1.6 * lineHeight) {
      let best = openListItems[0];
      let bestD = Math.abs(best.x - line.x);
      for (const cand of openListItems) {
        const d = Math.abs(cand.x - line.x);
        if (d < bestD) {
          bestD = d;
          best = cand;
        }
      }
      if (best.item.runs.length && runs.length) best.item.runs[best.item.runs.length - 1].text += ' ';
      best.item.runs.push(...runs);
      continue;
    }
    openListItems = [];
    // Paragraph: start a new one on a large vertical gap or alignment change.
    const newPara = !para || gap > 1.6 * lineHeight || (para && para.align !== align);
    if (newPara) {
      flushPara();
      para = { type: 'paragraph', runs: [], align, page: line.page, y: line.y };
    }
    // Join wrapped lines with a space between runs.
    if (para.runs.length && runs.length) para.runs[para.runs.length - 1].text += ' ';
    para.runs.push(...runs);
  }
  flushPara();
  return blocks;
}
