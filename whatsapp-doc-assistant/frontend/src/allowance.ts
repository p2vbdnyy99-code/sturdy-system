// What the dashboard says about the company's tenders: the free trial, a
// monthly plan, or a plan that has ended. Kept apart from the component so
// the wording can be unit-tested (allowance.test.ts). Re-running a tender that
// was already analysed is always free, so the wording is about new tenders.
import { formatDate } from './format.ts';

export type Allowance =
  | { kind: 'trial'; limit: number; used: number; remaining: number }
  | { kind: 'plan'; planName: string; periodEnd: string; limit: number; used: number; remaining: number }
  | { kind: 'plan_expired'; planName: string; periodEnd: string; limit: number; used: number; remaining: number };

export type AllowanceNotice = {
  tone: 'info' | 'warning';
  /** Text before the bold part, the bold part, and text after it. */
  before: string;
  bold: string;
  after: string;
  /** What to offer next, if anything. */
  next: 'pricing' | 'bigger-plan' | 'renew' | null;
};

const tenders = (n: number) => (n === 1 ? 'tender' : 'tenders');

export function allowanceNotice(a: Allowance): AllowanceNotice {
  if (a.kind === 'trial') {
    return a.remaining > 0
      ? { tone: 'info', before: 'Free trial: ', bold: `${a.remaining} of ${a.limit}`, after: ` ${tenders(a.remaining)} left to analyse.`, next: null }
      : { tone: 'warning', before: 'You’ve used all ', bold: `${a.limit} free-trial tenders`, after: '. You can still open and re-run them. To analyse new tenders, choose a monthly plan.', next: 'pricing' };
  }
  const until = formatDate(a.periodEnd) ?? 'the end of this period';
  if (a.kind === 'plan_expired') {
    return { tone: 'warning', before: 'Your ', bold: `${a.planName} plan`, after: ` ended on ${until}. You can still open and re-run your tenders. To analyse new ones, renew your plan.`, next: 'renew' };
  }
  return a.remaining > 0
    ? { tone: 'info', before: `${a.planName} plan: `, bold: `${a.remaining} of ${a.limit}`, after: ` ${tenders(a.remaining)} left this month (until ${until}).`, next: null }
    : { tone: 'warning', before: 'You’ve used all ', bold: `${a.limit} tenders in your ${a.planName} plan`, after: ` until ${until}. You can still open and re-run them. For more this month, move to a bigger plan.`, next: 'bigger-plan' };
}
