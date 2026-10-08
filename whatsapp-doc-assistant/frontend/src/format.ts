// Presentation-only formatting shared across pages. Pure functions, no React,
// so they run under `node --test` like dashboard/attentionState.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "9 Oct 2026". toLocaleDateString() alone renders 10/9/2026 or 9/10/2026
 *  depending on the browser, which is ambiguous for a deadline. null when the
 *  value isn't a real date. */
export function formatDate(value: string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Whole calendar days from `now` to `value` (negative once it has passed). */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(value);
  if (!d) return null;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOf(d) - startOf(now)) / DAY_MS);
}

/** "today", "tomorrow", "in 5 days", "3 days ago"; null when not a date. */
export function relativeDays(value: string | null | undefined, now: Date = new Date()): string | null {
  const days = daysUntil(value, now);
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Tender titles default to the uploaded filename; drop the ".pdf". */
export function displayTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim().replace(/\.pdf$/i, '').trim();
  return t || 'Untitled tender';
}

/** "PREPARING_BID" -> "Preparing bid", for enum values shown in filters. */
export function humanizeEnum(value: string): string {
  const s = value.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** BOQ quantities come back as numeric strings ("127300.50"); show them with
 *  Indian digit grouping ("1,27,300.5"). Anything else is shown as-is. */
export function formatQuantity(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : value;
}
