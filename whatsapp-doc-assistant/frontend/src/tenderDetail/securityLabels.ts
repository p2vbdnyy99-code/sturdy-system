// Labels for EMD and performance security entries (SecuritiesPanel, the
// dashboard's "Money with buyers").
import type { SecurityKind, SecurityMode, SecurityStatus } from '../api/tenders';

export const KIND_LABEL: Record<SecurityKind, string> = { EMD: 'EMD', PERFORMANCE: 'Performance security' };

export const MODE_LABEL: Record<SecurityMode, string> = {
  ONLINE: 'Paid online',
  DD: 'Demand draft',
  BG: 'Bank guarantee',
  FDR: 'FDR',
  EXEMPTED: 'Exempted (e.g. MSE)',
  NOT_REQUIRED: 'Not required',
};

export const STATUS_LABEL: Record<SecurityStatus, string> = {
  TO_ARRANGE: 'To arrange',
  SUBMITTED: 'With the buyer',
  RETURNED: 'Returned',
  FORFEITED: 'Forfeited',
};

/** ₹1,27,300 (Indian grouping); no paise unless there are some. */
export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Days from today (India) to a YYYY-MM-DD date; negative when past. */
export function daysToDate(day: string, now: Date = new Date()): number {
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Expires in 12 days", "Expires today", "Expired 3 days ago". */
export function expiryLabel(day: string, now: Date = new Date()): string {
  const d = daysToDate(day, now);
  if (d === 0) return 'Expires today';
  if (d > 0) return `Expires in ${d} ${d === 1 ? 'day' : 'days'}`;
  return `Expired ${-d} ${d === -1 ? 'day' : 'days'} ago`;
}
