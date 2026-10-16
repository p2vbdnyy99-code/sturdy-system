// Bounded polling for a single tender's processing/analysis phase. Per the
// approved M5c decisions: 2s interval, 120s cap per phase, and a timeout is
// explicitly NOT a failure and NEVER auto-retries (an operator must click
// "check again" — see dashboard/TenderRow.tsx). Polling only, no WebSockets/
// SSE, per the standing M5 decision.
import { useEffect, useState } from 'react';
import { getTender, type TenderDetail } from '../api/tenders';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

export type PollTarget = 'processing' | 'analysis';

export type PollState =
  | { status: 'polling' }
  | { status: 'settled'; tender: TenderDetail }
  | { status: 'timeout' };

function isSettled(target: PollTarget, tender: TenderDetail): boolean {
  return target === 'processing'
    ? tender.processingStatus === 'COMPLETED' || tender.processingStatus === 'FAILED'
    : tender.analysisStatus === 'COMPLETED' || tender.analysisStatus === 'FAILED';
}

/**
 * Polls GET /tenders/:id until `target`'s phase settles or 120s elapses.
 * Pass `tenderId: null` to stay idle. Pass a new `retryKey` (e.g. from a
 * "check again" button after a timeout) to restart the 120s budget.
 */
export function useTenderPolling(
  tenderId: string | null,
  companyId: string,
  target: PollTarget,
  retryKey = 0,
): PollState | null {
  const [state, setState] = useState<PollState | null>(null);

  useEffect(() => {
    if (!tenderId) {
      setState(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const startedAt = Date.now();
    setState({ status: 'polling' });

    async function tick() {
      try {
        const tender = await getTender(tenderId as string, companyId);
        if (cancelled) return;
        if (isSettled(target, tender)) {
          setState({ status: 'settled', tender });
          clearInterval(timer);
          return;
        }
      } catch {
        // A transient fetch error mid-poll doesn't stop polling — the next
        // tick tries again; only the 120s cap gives up (see below).
      }
      if (!cancelled && Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setState({ status: 'timeout' });
        clearInterval(timer);
      }
    }

    tick(); // check immediately rather than waiting a full interval first
    timer = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tenderId, companyId, target, retryKey]);

  return state;
}
