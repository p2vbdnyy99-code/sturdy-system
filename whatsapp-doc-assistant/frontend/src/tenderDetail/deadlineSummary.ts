// What the tender page's dark card says: time left to submit, and the result
// of the eligibility check if it has run. It reports counts only; there is no
// bid/no-bid verdict and no advice. Pure so it runs under `node --test`.
import { daysUntil, formatDate } from '../format.ts';

type Status = 'MEETS' | 'DOES_NOT_APPEAR_TO_MEET' | 'UNKNOWN';

export type DeadlineSummary = {
  /** The big figure: "12", "Today", "Closed" or "—". */
  figure: string;
  /** Next to the figure: "days left", "to submit", ... */
  unit: string;
  /** "Submit by 17 Oct 2026", or why there is no date. */
  byLine: string;
  /** Eligibility counts, or null when the check hasn't run. */
  eligibility: { met: number; notMet: number; unknown: number } | null;
  headline: string;
};

/** True when an eligibility check ran after the latest analysis (a new
 *  analysis replaces the requirements, so an older check no longer counts).
 *  A check can leave every requirement "unclear", so the statuses alone
 *  can't tell "checked" from "not checked". */
export function eligibilityWasChecked(activity: Array<{ eventType: string; createdAt: string }>): boolean {
  let checked = -Infinity;
  let analysed = -Infinity;
  for (const e of activity) {
    const t = new Date(e.createdAt).getTime();
    if (e.eventType === 'eligibility_checked') checked = Math.max(checked, t);
    if (e.eventType === 'analysis_completed' || e.eventType === 'analysis_replaced') analysed = Math.max(analysed, t);
  }
  return checked > -Infinity && checked >= analysed;
}

export function deadlineSummary(
  deadline: string | null,
  requirements: Array<{ companyStatus: Status }>,
  checkedFlag: boolean,
  now: Date = new Date(),
): DeadlineSummary {
  const days = daysUntil(deadline, now);
  const date = formatDate(deadline);
  let figure = '—';
  let unit = '';
  let byLine = 'No submission deadline was found in the document.';
  if (days !== null && date) {
    byLine = days < 0 ? `The deadline was ${date}.` : `Submit by ${date}.`;
    if (days < 0) figure = 'Closed';
    else if (days === 0) { figure = 'Today'; unit = 'is the deadline'; }
    else { figure = String(days); unit = days === 1 ? 'day left' : 'days left'; }
  }

  const checked = checkedFlag || requirements.some((r) => r.companyStatus !== 'UNKNOWN');
  const eligibility = checked
    ? {
        met: requirements.filter((r) => r.companyStatus === 'MEETS').length,
        notMet: requirements.filter((r) => r.companyStatus === 'DOES_NOT_APPEAR_TO_MEET').length,
        unknown: requirements.filter((r) => r.companyStatus === 'UNKNOWN').length,
      }
    : null;

  const n = requirements.length;
  const reqs = `${n} ${n === 1 ? 'requirement' : 'requirements'}`;
  const headline = eligibility
    ? `${eligibility.met} of ${reqs} appear met by your profile`
    : n > 0
      ? `${reqs} found. Eligibility not checked yet.`
      : 'No requirements were found in the document.';
  return { figure, unit, byLine, eligibility, headline };
}
