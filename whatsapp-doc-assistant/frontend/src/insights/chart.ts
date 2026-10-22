// Small, testable helpers for the founder's live dashboard (pages/Insights.tsx):
// scales, SVG paths and number formats. Charts are drawn as inline SVG with
// presentation attributes only, so they stay within the strict CSP.

/** A round axis top at or above `max` (1, 2, 2.5 or 5 × 10^n; at least 1). */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * mag >= max) return step * mag;
  }
  return 10 * mag;
}

/** x position of point i of n across [left, right]; a single point sits in the middle. */
export function xAt(i: number, n: number, left: number, right: number): number {
  return n <= 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1);
}

/** y position of value v on a scale from 0 (bottom) to top. */
export function yAt(v: number, top: number, bottomY: number, topY: number): number {
  return bottomY - (Math.max(0, v) / (top || 1)) * (bottomY - topY);
}

/** SVG path for a line through the values, and the closed area under it. */
export function linePaths(values: number[], box: { left: number; right: number; top: number; bottom: number }, scaleTop = niceMax(Math.max(0, ...values))) {
  if (values.length === 0) return { line: '', area: '' };
  const pts = values.map((v, i) => [xAt(i, values.length, box.left, box.right), yAt(v, scaleTop, box.bottom, box.top)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.at(-1)![0].toFixed(1)},${box.bottom} L${pts[0][0].toFixed(1)},${box.bottom} Z`;
  return { line, area };
}

/** 1,284 / 12.9K / 3.4M (Indian digit grouping below 10,000). */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-IN');
}

/** Change against the previous period: signed percent, or "new" from zero. */
export function delta(current: number, previous: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (current === previous) return { text: 'no change', dir: 'flat' };
  if (previous === 0) return { text: `+${compact(current)} new`, dir: 'up' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** Share of a funnel step relative to the step before it, as "42%" (or "–"). */
export function stepRate(value: number, before: number): string {
  if (!(before > 0)) return '–';
  return `${Math.round((value / before) * 100)}%`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '–';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
