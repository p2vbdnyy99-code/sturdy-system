// "Bidding open / closes today / closed", from the submission deadline the
// analysis found. It describes the date in the document only; TenderTez does
// not check the portal, so an extension the user hasn't uploaded is unknown.
import { daysUntil } from '../format.ts';

export type BiddingStatus = { label: string; tone: 'open' | 'soon' | 'closed' } | null;

export function biddingStatus(deadline: string | null, now: Date = new Date()): BiddingStatus {
  const days = daysUntil(deadline, now);
  if (days === null) return null;
  if (days < 0) return { label: 'Bidding closed', tone: 'closed' };
  if (days === 0) return { label: 'Bidding closes today', tone: 'soon' };
  if (days <= 3) return { label: `Bidding open · ${days === 1 ? '1 day' : `${days} days`} left`, tone: 'soon' };
  return { label: 'Bidding open', tone: 'open' };
}
