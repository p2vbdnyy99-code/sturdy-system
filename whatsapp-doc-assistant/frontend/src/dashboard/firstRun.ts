// What the dashboard tells a user about uploading and starting analysis, kept
// apart from the components so the wording and the rules can be unit-tested
// (firstRun.test.ts). Numbers always come from the server's summary: the
// allowance (backend analysis/budget.js) and the upload limit (config).
import type { Allowance } from '../allowance.ts';

/** The first-run panel shows only once the summary has loaded and the
 *  company has no tenders at all (uploaded or tracked from the feed). */
export function isFirstRun(summary: { totalTenders: number } | null): boolean {
  return summary !== null && summary.totalTenders === 0;
}

const tenders = (n: number) => (n === 1 ? 'tender' : 'tenders');

/** Whether new uploads can't be analysed until the user acts (plan used up). */
export function allowanceUsedUp(a: Allowance | null): boolean {
  return a !== null && (a.kind === 'plan_expired' || a.remaining <= 0);
}

/**
 * The sentence shown next to the upload button, before a file is chosen. It
 * is the user's notice that the analysis starts by itself and what it uses.
 * The count is what the page last loaded; the server checks again when the
 * analysis starts, so the wording never promises a slot.
 */
export function uploadNotice(a: Allowance | null, autoAnalyze: boolean): string {
  if (!autoAnalyze) {
    return a && !allowanceUsedUp(a)
      ? `When the PDF has been read, click Analyze. Each new tender you analyse uses 1 of your ${remainingText(a)}.`
      : 'When the PDF has been read, click Analyze.';
  }
  if (a === null) return 'When the PDF has been read, its analysis starts automatically.';
  if (allowanceUsedUp(a)) return usedUpText(a, 'a new upload');
  return a.kind === 'plan'
    ? `When the PDF has been read, its analysis starts automatically if your ${a.planName} plan still has a tender `
      + `left this month (${a.remaining} now), and uses one. Re-running a tender is free.`
    : `When the PDF has been read, its analysis starts automatically if you still have a free tender left `
      + `(${a.remaining} now), and uses one. Re-running a tender is free.`;
}

function remainingText(a: Allowance): string {
  return a.kind === 'plan'
    ? `${a.remaining} ${tenders(a.remaining)} left in your ${a.planName} plan this month`
    : `${a.remaining} free ${tenders(a.remaining)} left`;
}

/** "<subject> will be read but not analysed until …", for a used-up allowance. */
function usedUpText(a: Allowance, subject: string): string {
  if (a.kind === 'trial') return `Your free tenders are used: ${subject} will be read but not analysed until you choose a plan.`;
  if (a.kind === 'plan_expired') return `Your ${a.planName} plan has ended: ${subject} will be read but not analysed until you renew.`;
  return `This month's ${a.planName} tenders are used: ${subject} will be read but not analysed until next month or a bigger plan.`;
}

/** `undefined`: not known (not loaded yet, or the request failed). `null`: no limit. */
export type KnownAllowance = Allowance | null | undefined;

/**
 * The kind of allowance a notice was built from, as the server names it
 * (backend analysis/budget.js entitlementKey): 'trial', 'plan:<name>',
 * 'unlimited', or 'plan_expired:<name>'. The upload sends it with the
 * automatic-start request; the server starts nothing unless the company's
 * own entitlement is still this kind when reading finishes.
 */
export function allowanceToken(a: Allowance | null): string {
  return a === null ? 'unlimited' : a.kind === 'trial' ? 'trial' : `${a.kind}:${a.planName}`;
}

/**
 * Whether the upload asks the server to start the analysis by itself. Only
 * when the setting is on, the notice was shown from a loaded allowance that
 * isn't used up, and the allowance re-read just before the upload still
 * isn't used up and is the same kind (a trial notice never covers a plan
 * slot). Anything unknown means no: the user can still click Analyze. The
 * server checks everything again regardless (backend analysis/start.js).
 */
export function shouldRequestAutoAnalysis(enabled: boolean, shown: KnownAllowance, fresh: KnownAllowance): boolean {
  if (!enabled || shown === undefined || fresh === undefined) return false;
  if (allowanceUsedUp(shown) || allowanceUsedUp(fresh)) return false;
  return allowanceToken(shown) === allowanceToken(fresh);
}

/**
 * What the dashboard says after an upload. It follows what was actually
 * requested: it never says the analysis will start when it wasn't asked
 * for, and even when it was, it says what happens if it can't start.
 */
export function afterUploadMessage({ duplicate, requested, allowance }: {
  duplicate: boolean;
  /** The upload asked for the automatic start and the server accepted the request. */
  requested: boolean;
  /** The latest allowance known (re-read before upload, else the one shown). */
  allowance: KnownAllowance;
}): string {
  if (duplicate) return 'You had already uploaded this PDF, so it wasn’t added again. It is in your list below.';
  if (requested) {
    return 'Uploaded. TenderTez is reading it now. When reading finishes, the analysis starts by itself if your '
      + 'allowance and today’s limits allow; the tender then shows as in progress, or with the next step if it '
      + 'couldn’t start. You can leave this page.';
  }
  if (allowance && allowanceUsedUp(allowance)) return `Uploaded. ${usedUpText(allowance, 'it')}`;
  return 'Uploaded. TenderTez is reading it now. When it has been read, click Analyze.';
}

export type BlockedBy = 'profile_incomplete' | 'trial_exhausted' | 'plan_exhausted' | 'plan_expired' | 'allowance_changed' | null;

/** Why a ready tender wasn't analysed, and the next step, for the ready box.
 *  'confirm': the Analyze button, after the user has seen their allowance. */
export function blockedText(code: BlockedBy): { text: string; next: 'profile' | 'pricing' | 'contact' | 'confirm' | null } {
  switch (code) {
    case 'allowance_changed':
      return {
        text: 'Not analysed automatically: your free trial or plan changed after you uploaded it. Check what you have now, then click Analyze.',
        next: 'confirm',
      };
    case 'profile_incomplete':
      return { text: 'Complete your company profile to analyse this tender.', next: 'profile' };
    case 'trial_exhausted':
      return { text: 'Your free tenders are used. Choose a plan to analyse it.', next: 'pricing' };
    case 'plan_exhausted':
      return { text: 'This month’s plan tenders are used. Move to a bigger plan, or analyse it next month.', next: 'contact' };
    case 'plan_expired':
      return { text: 'Your plan has ended. Renew it to analyse this tender.', next: 'contact' };
    default:
      return { text: 'Not analysed yet.', next: null };
  }
}

/**
 * For a never-analysed tender in the full list: what blocks a new analysis
 * once the free or plan tenders are used (it would only answer 402), so the
 * row offers the plans instead of Analyze. A failed tender already holds its
 * slot (retries are free), so it keeps Retry and this isn't used for it.
 */
export function rowBlockedBy(a: Allowance | null | undefined): BlockedBy {
  if (!a || !allowanceUsedUp(a)) return null;
  return a.kind === 'trial' ? 'trial_exhausted' : a.kind === 'plan_expired' ? 'plan_expired' : 'plan_exhausted';
}

/** A chosen file over the server's limit, caught before it is sent. */
export function fileTooLarge(sizeBytes: number, maxMb: number | null | undefined): string | null {
  if (!maxMb || sizeBytes <= maxMb * 1024 * 1024) return null;
  return `This file is larger than the ${maxMb} MB limit. Try the main tender document without drawings or long annexures.`;
}

export type PollTarget = 'processing' | 'analysis';

// When reading finishes, the server may start the analysis by itself a moment
// later (backend analysis/start.js). The tender row keeps polling this long
// after first seeing "read, not analysed", so it shows "Analysis in progress"
// rather than an Analyze button for a tender already being analysed.
export const AUTO_START_GRACE_MS = 4000;

/** Whether polling can stop (dashboard/useTenderPolling.ts). `waitedMs`: how
 *  long the tender has been seen read but not analysed. */
export function isSettled(
  target: PollTarget,
  tender: { processingStatus: string; analysisStatus: string },
  waitedMs = Infinity,
): boolean {
  if (target === 'analysis') return tender.analysisStatus === 'COMPLETED' || tender.analysisStatus === 'FAILED';
  if (tender.processingStatus === 'FAILED') return true;
  if (tender.processingStatus !== 'COMPLETED') return false;
  return tender.analysisStatus !== 'NOT_STARTED' || waitedMs >= AUTO_START_GRACE_MS;
}
