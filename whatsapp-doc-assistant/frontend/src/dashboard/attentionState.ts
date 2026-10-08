// Dashboard "attention state" — derived client-side from fields the backend
// already returns, per the explicit product decision NOT to add a new
// backend status column for this (see BIDPILOT_ARCHITECTURE.md's M5
// review). Pure function, zero React/DOM dependency, so it's unit-testable
// directly with `node --test` — no frontend testing framework needed.
//
// This module interprets only status enums and a deadline timestamp that
// the backend already computed/validated. It never infers, re-derives, or
// second-guesses a tender FACT (organization, requirement, evidence, ...) —
// that's the M4/M5a evidence-first boundary, and this file stays entirely
// on the presentation side of it.
import type { AnalysisStatus, ProcessingStatus } from '../api/tenders';

export type AttentionState =
  | 'PROCESSING'
  | 'PROCESSING_FAILED'
  | 'ANALYSIS_REQUIRED'
  | 'ANALYSIS_IN_PROGRESS'
  | 'ANALYSIS_FAILED'
  | 'DEADLINE_APPROACHING'
  | 'READY';

export const ATTENTION_LABELS: Record<AttentionState, string> = {
  PROCESSING: 'Processing',
  PROCESSING_FAILED: 'Processing failed',
  ANALYSIS_REQUIRED: 'Analysis required',
  ANALYSIS_IN_PROGRESS: 'Analysis in progress',
  ANALYSIS_FAILED: 'Analysis failed',
  DEADLINE_APPROACHING: 'Deadline approaching',
  READY: 'Ready',
};

const DEADLINE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AttentionInput = {
  processingStatus: ProcessingStatus;
  analysisStatus: AnalysisStatus;
  /** ISO timestamp or null. A non-parseable string (the rare "AI found a
   *  deadline but couldn't calendar-parse it" case — see repo/analysis.js's
   *  DATE_OVERVIEW_FIELDS) safely falls through to READY rather than
   *  throwing: an Invalid Date's comparisons are always false, never a
   *  crash, and there's no real calendar date to warn about anyway. */
  submissionDeadline: string | null;
};

/**
 * Priority-ordered, first-match-wins — exactly the table approved in the M5
 * product review. `now` is injectable for tests; defaults to the real clock.
 */
export function deriveAttentionState(input: AttentionInput, now: Date = new Date()): AttentionState {
  const { processingStatus, analysisStatus, submissionDeadline } = input;

  if (processingStatus === 'UPLOADED' || processingStatus === 'PROCESSING' || processingStatus === 'EXTRACTING') {
    return 'PROCESSING';
  }
  if (processingStatus === 'FAILED') {
    return 'PROCESSING_FAILED';
  }
  // processingStatus is COMPLETED from here (its own 'ANALYZING' value is a
  // deprecated enum member the backend never sets — see enums.js).
  if (analysisStatus === 'NOT_STARTED') {
    return 'ANALYSIS_REQUIRED';
  }
  if (analysisStatus === 'ANALYZING') {
    return 'ANALYSIS_IN_PROGRESS';
  }
  if (analysisStatus === 'FAILED') {
    return 'ANALYSIS_FAILED';
  }
  // analysisStatus is COMPLETED from here.
  if (submissionDeadline) {
    const deadline = new Date(submissionDeadline).getTime();
    const nowMs = now.getTime();
    const windowEndMs = nowMs + DEADLINE_WINDOW_DAYS * DAY_MS;
    // Inclusive both ends: now <= deadline <= now + 7 days. A past deadline
    // does NOT become its own "overdue" state — deliberately out of scope
    // for M5c, falls through to READY like any other completed tender.
    if (deadline >= nowMs && deadline <= windowEndMs) {
      return 'DEADLINE_APPROACHING';
    }
  }
  return 'READY';
}
