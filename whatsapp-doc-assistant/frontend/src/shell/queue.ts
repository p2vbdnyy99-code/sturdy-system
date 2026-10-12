// The tender queue in the app's left panel: which tenders count as "due soon"
// and the short days-left label each one carries. Pure functions so they run
// under `node --test` (queue.test.ts).
import { daysUntil } from '../format.ts';

export const DUE_SOON_DAYS = 14;

export type QueueMode = 'dueSoon' | 'all';

type QueueTender = { title: string | null; organization: string | null; submissionDeadline: string | null };

export type DueLabel = { text: string; tone: 'urgent' | 'soon' | 'later' | 'closed' | 'none'; title: string };

/** "Today", "1 day", "12 days", "Closed" or "—", for the queue's chip. */
export function dueLabel(deadline: string | null, now: Date = new Date()): DueLabel {
  const days = daysUntil(deadline, now);
  if (days === null) return { text: '—', tone: 'none', title: 'No deadline found yet' };
  if (days < 0) return { text: 'Closed', tone: 'closed', title: 'The deadline has passed' };
  if (days === 0) return { text: 'Today', tone: 'urgent', title: 'Due today' };
  const text = days === 1 ? '1 day' : `${days} days`;
  const tone = days <= 7 ? 'urgent' : days <= DUE_SOON_DAYS ? 'soon' : 'later';
  return { text, tone, title: `Due in ${text}` };
}

export function isDueSoon(deadline: string | null, now: Date = new Date()): boolean {
  const days = daysUntil(deadline, now);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

/** The tenders the panel shows for a mode and a search, in the given order. */
export function filterQueue<T extends QueueTender>(tenders: T[], mode: QueueMode, query: string, now: Date = new Date()): T[] {
  const q = query.trim().toLowerCase();
  return tenders.filter((t) => {
    if (mode === 'dueSoon' && !isDueSoon(t.submissionDeadline, now)) return false;
    if (!q) return true;
    return `${t.title ?? ''} ${t.organization ?? ''}`.toLowerCase().includes(q);
  });
}
