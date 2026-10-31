// Starting a tender's analysis: the one place that decides whether it may
// start. Used by POST /tenders/:id/analyze (the Analyze button) and by the
// automatic start after a PDF has been read (routes/tenders.js passes
// autoStartAnalysis to processExtraction when the upload asked for it).
// -----------------------------------------------------------------------------
// The checks run in the order the route always used, and every refusal
// leaves the tender exactly as it was (NOT_STARTED or FAILED, no slot taken),
// so the Analyze button still works later:
//   1. the tender exists in this company (404)
//   2. it has its PDF (409 no_document)
//   3. the company profile, past the free tenders (409 profile_incomplete)
//   4. its PDF has been read (409 not_ready / not_readable)
//   5. size and the daily caps (413 / 429), before anything is spent
//   6. a trial or plan slot (402); claimTenderSlot is idempotent per tender
//      and runs under a row lock on the company, so a re-run or a second
//      start never takes a second slot
//   7. the compare-and-set to ANALYZING (409 already_running): of two
//      simultaneous starts only one gets a row back and runs.

import { and, desc, eq } from 'drizzle-orm';
import { log } from '../../logger.js';
import { config } from '../../config.js';
import { tenderEvents } from '../../db/schema/index.js';
import { PLANS } from '../plans.js';
import { getTender, startAnalysis } from '../repo/tenders.js';
import { listDocumentsForTender } from '../repo/documents.js';
import { listPages } from '../repo/pages.js';
import { chunkPages } from './chunker.js';
import {
  assertAnalysisBudget, AnalysisBudgetError, claimTenderSlot, getAllowance, tenderHasSlot,
} from './budget.js';
import { runAnalysis } from './pipeline.js';
import { profileNeededFor, PROFILE_REQUIRED_MESSAGE, FREE_TENDERS_WITHOUT_PROFILE } from '../profileGate.js';

/** Why an analysis did not start: the HTTP status, a code the app acts on,
 *  and a message a user can read. */
export class AnalysisStartRefusal extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'AnalysisStartRefusal';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  toJson() {
    return { error: this.message, ...(this.code ? { code: this.code } : {}), ...this.extra };
  }
}

const BUDGET_STATUS = { tender_too_large: 413, trial_exhausted: 402, plan_exhausted: 402, plan_expired: 402, allowance_changed: 409 };

export const NOT_READY_MESSAGE = 'This tender is still being read. Its analysis can start when reading finishes.';
export const NOT_READABLE_MESSAGE =
  'This tender’s PDF could not be read, so it can’t be analysed. Please upload the PDF again; '
  + 'the original file from the tender portal works best.';
export const ALREADY_RUNNING_MESSAGE = 'This tender is already being analysed.';

/**
 * Starts the analysis of one tender, or throws AnalysisStartRefusal. On
 * success the analysis is ANALYZING and runs in the background.
 * `expectedAllowance` is passed only by the automatic start (see below).
 */
export async function startTenderAnalysis(db, scope, tenderId, { expectedAllowance } = {}) {
  const tender = await getTender(scope, tenderId);
  if (!tender) throw new AnalysisStartRefusal(404, null, 'Not found.');
  // A tender tracked from the feed has no document until one is attached.
  if ((await listDocumentsForTender(scope, tender.id)).length === 0) {
    throw new AnalysisStartRefusal(409, 'no_document', 'Attach the tender document first, then analyse it.');
  }
  const missing = await profileNeededFor(db, scope.companyId, tender.id);
  if (missing) {
    throw new AnalysisStartRefusal(409, 'profile_incomplete', PROFILE_REQUIRED_MESSAGE, {
      missing, freeTenders: FREE_TENDERS_WITHOUT_PROFILE,
    });
  }
  // Analysis works from the extracted page text.
  if (tender.processingStatus === 'FAILED') throw new AnalysisStartRefusal(409, 'not_readable', NOT_READABLE_MESSAGE);
  if (tender.processingStatus !== 'COMPLETED') throw new AnalysisStartRefusal(409, 'not_ready', NOT_READY_MESSAGE);

  const pages = await listPages(scope, tender.id);
  const chunks = chunkPages(pages, { maxChars: config.bidpilot.analysis.chunkChars });
  try {
    await assertAnalysisBudget(db, scope.companyId, chunks.length);
    // Last, so a tender refused by the checks above never uses a slot.
    await claimTenderSlot(db, scope.companyId, tender.id, expectedAllowance === undefined ? {} : { expectedAllowance });
  } catch (err) {
    if (err instanceof AnalysisBudgetError) {
      throw new AnalysisStartRefusal(BUDGET_STATUS[err.reason] ?? 429, err.reason, err.message);
    }
    throw err;
  }

  // Atomic compare-and-set (see startAnalysis()): only the request that
  // actually moved the row to ANALYZING gets it back.
  const isReanalysis = tender.analysisStatus === 'COMPLETED';
  const started = await startAnalysis(scope, tender.id);
  if (!started) throw new AnalysisStartRefusal(409, 'already_running', ALREADY_RUNNING_MESSAGE);

  setImmediate(() => {
    runAnalysis(scope, tender.id, { isReanalysis }).catch((err) => {
      log.error(`bidpilot: unhandled analysis failure for tender=${tender.id}:`, err);
    });
  });
  return { tenderId: tender.id, analysisStatus: 'ANALYZING' };
}

// ── The automatic start ─────────────────────────────────────────────────
// The upload notice describes one kind of allowance (free trial, a named
// plan, or no limit). The upload sends that kind; it is stored as a
// tender_events row before reading starts, and checked against the
// company's entitlement, derived from its own subscription rows, inside the
// slot lock (claimTenderSlot). A different kind, an unreadable or missing
// record, or no record at all: no automatic start, nothing claimed, the
// tender stays ready for an Analyze click. The client's value is only ever
// compared with the server's own; it never grants anything.

export const AUTO_REQUESTED_EVENT = 'auto_analysis_requested';
export const AUTO_SKIPPED_EVENT = 'auto_analysis_skipped';

/** The allowance kind an upload's notice described, if it is a valid one:
 *  'trial', 'unlimited' or 'plan:<a sold plan's name>'. Anything else: null. */
export function parseExpectedAllowance(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === 'trial' || value === 'unlimited') return value;
  const plan = /^plan:(.{1,40})$/.exec(value)?.[1];
  return plan && Object.values(PLANS).some((p) => p.name === plan) ? value : null;
}

/** Stores the upload's request for the automatic start. Call before reading starts. */
export async function recordAutoAnalysisRequest(scope, tenderId, expected, userId = null) {
  await scope.db.insert(tenderEvents).values({
    tenderId,
    eventType: AUTO_REQUESTED_EVENT,
    description: 'Upload asked for the analysis to start automatically once the PDF is read.',
    metadata: { expected },
    createdBy: userId,
  });
}

async function latestEvent(db, tenderId, eventType) {
  const [row] = await db.select().from(tenderEvents)
    .where(and(eq(tenderEvents.tenderId, tenderId), eq(tenderEvents.eventType, eventType)))
    .orderBy(desc(tenderEvents.createdAt))
    .limit(1);
  return row ?? null;
}

const SKIP_DESCRIPTION = {
  allowance_changed: 'Not analysed automatically: the free trial or plan changed after upload.',
};

/**
 * The automatic start after a tender's PDF has been read, for an upload
 * that asked for it (recordAutoAnalysisRequest). Only a tender that was
 * never analysed is started (a failed one is the user's to retry), and only
 * through startTenderAnalysis with the recorded allowance kind, so every
 * check above applies and a changed allowance takes nothing. A refusal
 * leaves the tender ready to analyse and is recorded; this never throws.
 * Returns { started, code }.
 */
export async function autoStartAnalysis(db, scope, tenderId) {
  if (!config.bidpilot.analysis.autoStart) return { started: false, code: 'auto_start_off' };
  try {
    const tender = await getTender(scope, tenderId);
    if (!tender || tender.processingStatus !== 'COMPLETED' || tender.analysisStatus !== 'NOT_STARTED') {
      return { started: false, code: 'not_applicable' };
    }
    const expected = parseExpectedAllowance((await latestEvent(scope.db, tender.id, AUTO_REQUESTED_EVENT))?.metadata?.expected);
    if (!expected) {
      log.info(`metric bidpilot_auto_analysis company=${scope.companyId} tender=${tenderId} outcome=no_request`);
      return { started: false, code: 'no_request' };
    }
    await startTenderAnalysis(db, scope, tenderId, { expectedAllowance: expected });
    log.info(`metric bidpilot_auto_analysis company=${scope.companyId} tender=${tenderId} outcome=started`);
    return { started: true, code: null };
  } catch (err) {
    const code = err instanceof AnalysisStartRefusal ? err.code : 'error';
    if (code === 'error') log.error(`bidpilot: automatic analysis start failed for tender=${tenderId}:`, err);
    log.info(`metric bidpilot_auto_analysis company=${scope.companyId} tender=${tenderId} outcome=${code}`);
    if (code !== 'already_running' && code !== 'not_found') {
      await scope.db.insert(tenderEvents).values({
        tenderId, eventType: AUTO_SKIPPED_EVENT, metadata: { reason: code },
        description: SKIP_DESCRIPTION[code] ?? 'Not analysed automatically.',
      }).catch((e) => log.error(`bidpilot: could not record the skipped automatic start for tender=${tenderId}:`, e));
    }
    return { started: false, code };
  }
}

/**
 * For the dashboard's "ready to analyse" list: why each tender would not
 * start now, from the same rules (profile, then the trial or plan), or why
 * it wasn't started by itself ('allowance_changed': the Analyze button
 * works, after the user has seen their current allowance), or null when the
 * Analyze button should simply work. Daily caps aren't predicted: they
 * depend on the tender's size and are reported when Analyze is clicked.
 * `tenderIds` must come from the company's own (scoped) summary.
 */
export async function startBlockers(db, companyId, tenderIds, allowance) {
  const result = {};
  const left = allowance === undefined ? await getAllowance(db, companyId) : allowance;
  for (const id of tenderIds) {
    if (await profileNeededFor(db, companyId, id)) {
      result[id] = 'profile_incomplete';
    } else if (left && left.remaining <= 0 && !(await tenderHasSlot(db, companyId, id))) {
      result[id] = left.kind === 'plan_expired' ? 'plan_expired' : left.kind === 'plan' ? 'plan_exhausted' : 'trial_exhausted';
    } else if ((await latestEvent(db, id, AUTO_SKIPPED_EVENT))?.metadata?.reason === 'allowance_changed') {
      result[id] = 'allowance_changed';
    } else {
      result[id] = null;
    }
  }
  return result;
}
