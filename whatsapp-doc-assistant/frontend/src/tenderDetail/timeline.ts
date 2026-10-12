// The tender's dates as one timeline with a "today" marker, for the Key dates
// card. Pure so it runs under `node --test` (timeline.test.ts). Only dates the
// analysis actually parsed are placed; the rest are listed as written.
import { daysUntil } from '../format.ts';

type DateLike = { id: string; label: string; rawText: string; parsedDate: string | null };

export type TimelineEntry<T> =
  | { kind: 'date'; item: T; days: number; past: boolean }
  | { kind: 'today' };

export type Timeline<T> = { entries: TimelineEntry<T>[]; undated: T[] };

export function buildTimeline<T extends DateLike>(dates: T[], now: Date = new Date()): Timeline<T> {
  const dated: Array<{ item: T; days: number; time: number }> = [];
  const undated: T[] = [];
  for (const item of dates) {
    const days = daysUntil(item.parsedDate, now);
    if (days === null || item.parsedDate === null) undated.push(item);
    else dated.push({ item, days, time: new Date(item.parsedDate).getTime() });
  }
  dated.sort((a, b) => a.time - b.time);

  const entries: TimelineEntry<T>[] = [];
  let todayPlaced = false;
  for (const d of dated) {
    // Today sits after anything already past and before anything from today on.
    if (!todayPlaced && d.days >= 0) { entries.push({ kind: 'today' }); todayPlaced = true; }
    entries.push({ kind: 'date', item: d.item, days: d.days, past: d.days < 0 });
  }
  if (!todayPlaced && dated.length > 0) entries.push({ kind: 'today' });
  return { entries, undated };
}

/** "today", "in 3 days", "2 days ago". */
export function daysPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
