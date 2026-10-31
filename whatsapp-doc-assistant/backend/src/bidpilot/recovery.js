// Startup recovery for work interrupted by a restart or crash.
// -----------------------------------------------------------------------------
// Extraction and analysis run in-process via setImmediate (not a durable
// queue), so a restart kills them mid-flight and leaves the tender stuck:
// analysisStatus=ANALYZING makes POST /analyze answer 409 forever, and a
// tender stuck mid-extraction never completes. Run once at boot, BEFORE the
// server accepts requests, this flips such rows to FAILED so the normal retry
// paths work again (Retry analysis; re-upload, since duplicate detection
// ignores FAILED tenders).
//
// Assumes ONE app process per database — true today (fly.toml runs a single
// machine). With several instances this would fail another instance's live
// work, and needs a heartbeat/lease instead.
//
// Deliberately not CompanyScope'd: a system-wide maintenance pass that only
// touches status columns and never reads or returns tenant data.

import { inArray, eq } from 'drizzle-orm';
import { tenders, tenderEvents } from '../db/schema/index.js';
import { log } from '../logger.js';

export const INTERRUPTED_ANALYSIS_MESSAGE =
  'Analysis was interrupted by a server restart. Please run it again.';
// No "upload again" here: the tender page adds that guidance to every
// processing failure, so including it would repeat it.
export const INTERRUPTED_PROCESSING_MESSAGE = 'Processing was interrupted by a server restart.';

const IN_FLIGHT_PROCESSING = ['UPLOADED', 'PROCESSING', 'EXTRACTING'];

export async function recoverInterruptedWork(db) {
  const now = new Date();

  return db.transaction(async (tx) => {
    // Previous analysis data is left untouched, same as markAnalysisFailed():
    // an interrupted re-analysis keeps showing the last successful result.
    const analyses = await tx
      .update(tenders)
      .set({ analysisStatus: 'FAILED', analysisError: INTERRUPTED_ANALYSIS_MESSAGE, updatedAt: now })
      .where(eq(tenders.analysisStatus, 'ANALYZING'))
      .returning({ id: tenders.id });

    const processing = await tx
      .update(tenders)
      .set({ processingStatus: 'FAILED', processingError: INTERRUPTED_PROCESSING_MESSAGE, updatedAt: now })
      .where(inArray(tenders.processingStatus, IN_FLIGHT_PROCESSING))
      .returning({ id: tenders.id });

    const events = [
      ...analyses.map(({ id }) => ({
        tenderId: id, eventType: 'analysis_interrupted', description: INTERRUPTED_ANALYSIS_MESSAGE,
      })),
      ...processing.map(({ id }) => ({
        tenderId: id, eventType: 'processing_interrupted', description: INTERRUPTED_PROCESSING_MESSAGE,
      })),
    ];
    if (events.length) await tx.insert(tenderEvents).values(events);

    if (events.length) {
      log.warn(
        `bidpilot recovery: marked ${analyses.length} interrupted analysis run(s) and ` +
          `${processing.length} interrupted extraction(s) as FAILED`,
      );
    }
    return { analyses: analyses.length, processing: processing.length };
  });
}
