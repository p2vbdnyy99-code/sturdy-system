// Persisting one analysis run — replace, not merge.
// -----------------------------------------------------------------------------
// Per the approved design: re-analyzing a tender REPLACES its AI-derived
// intelligence wholesale rather than trying to reconcile old vs. new
// extraction. This keeps behavior simple and predictable — no risk of
// "Requirement A / Requirement A / Requirement A" accumulating across
// repeated Analyze clicks. Deliberately no analysisRun history table for v1
// (current-state model): what happened IS recorded, via a tender_events row
// this function writes — that's the audit/activity trail, distinct from the
// document facts themselves (tender_dates) per the "events vs. dates" design
// split. A dedicated analysisRun table can be added later if the UI
// demonstrates it's actually needed.
//
// Everything below runs in ONE transaction: either the whole replacement
// lands, or none of it does — a tender is never left with half of the old
// analysis and half of the new.

import { eq } from 'drizzle-orm';
import { tenders, tenderRequirements, tenderBoqItems, tenderDates, tenderRedFlags, tenderEvents } from '../../db/schema/index.js';
import { createRequirementWithEvidence } from './requirements.js';

// submissionDeadline/openingDate are the only two overview fields backed by a
// typed (timestamp) tenders column rather than text — every other overview
// field is free text and can hold the AI's extracted value verbatim (see
// tenders.js's schema comment on estimatedValue/emd/tenderFee for why those
// are text too, not numeric). A date field's AI value is only ever a
// best-effort ISO-parseable string; same "never invent, never throw on
// unparseable" reasoning tender_dates.parsedDate already uses. When it
// doesn't parse, the typed column is left null (never a fabricated date) and
// the raw text is preserved in overviewEvidence.rawValue instead — otherwise
// a real, honestly-extracted-but-non-calendar answer like "within 30 days of
// opening" would just vanish.
const DATE_OVERVIEW_FIELDS = new Set(['submissionDeadline', 'openingDate']);

/** Delete all AI-derived rows for a tender (requirements, which cascades to
 *  their evidence; BOQ; dates; red flags). Overview fields on `tenders`
 *  itself are overwritten by the subsequent UPDATE, not deleted first. */
async function deleteAiDerivedData(tx, tenderId) {
  await tx.delete(tenderRequirements).where(eq(tenderRequirements.tenderId, tenderId));
  await tx.delete(tenderBoqItems).where(eq(tenderBoqItems.tenderId, tenderId));
  await tx.delete(tenderDates).where(eq(tenderDates.tenderId, tenderId));
  await tx.delete(tenderRedFlags).where(eq(tenderRedFlags.tenderId, tenderId));
}

/**
 * @param {{overview, requirements, boq, dates, redFlags}} aggregated — the
 *   output of aggregate.js's aggregateResults()
 * @param {{isReanalysis: boolean}} meta — drives which tender_events entry
 *   gets written ("analysis completed" vs. "tender re-analyzed")
 */
export async function replaceAnalysis(scope, tenderId, aggregated, meta = {}) {
  const { overview, requirements, boq, dates, redFlags } = aggregated;

  return scope.db.transaction(async (tx) => {
    const txScope = scope.withDb(tx);

    await deleteAiDerivedData(tx, tenderId);

    // Requirements go through the SAME evidence-first enforcement point as
    // every other milestone — createRequirementWithEvidence() is still the
    // only way a tender_requirements row can exist, unmodified since
    // Milestone 1. (Its own internal transaction becomes a savepoint nested
    // inside this one — supported by drizzle-orm's pg driver.)
    for (const r of requirements) {
      await createRequirementWithEvidence(
        txScope,
        tenderId,
        { category: r.category, title: r.title, description: r.description, mandatory: r.mandatory },
        [{
          sourcePage: r.sourcePage,
          evidenceText: r.evidenceText,
          extractedValue: r.extractedValue,
          confidence: r.confidence,
        }],
      );
    }

    if (boq.length) {
      await tx.insert(tenderBoqItems).values(boq.map((b) => ({ tenderId, ...b })));
    }
    if (dates.length) {
      await tx.insert(tenderDates).values(dates.map((d) => ({ tenderId, ...d })));
    }
    if (redFlags.length) {
      await tx.insert(tenderRedFlags).values(redFlags.map((f) => ({ tenderId, ...f })));
    }

    const overviewUpdate = {};
    const overviewEvidence = {};
    for (const [field, entry] of Object.entries(overview)) {
      if (DATE_OVERVIEW_FIELDS.has(field)) {
        const parsed = entry.value && !Number.isNaN(Date.parse(entry.value)) ? new Date(entry.value) : null;
        overviewUpdate[field] = parsed;
        overviewEvidence[field] = { sourcePage: entry.sourcePage, evidenceText: entry.evidenceText, rawValue: entry.value };
      } else {
        overviewUpdate[field] = entry.value;
        overviewEvidence[field] = { sourcePage: entry.sourcePage, evidenceText: entry.evidenceText };
      }
    }

    const [updatedTender] = await tx
      .update(tenders)
      .set({
        ...overviewUpdate,
        overviewEvidence: Object.keys(overviewEvidence).length ? overviewEvidence : null,
        analysisStatus: 'COMPLETED',
        analysisError: null,
        analyzedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenders.id, tenderId))
      .returning();

    await tx.insert(tenderEvents).values({
      tenderId,
      eventType: meta.isReanalysis ? 'analysis_replaced' : 'analysis_completed',
      description: meta.isReanalysis
        ? 'Tender re-analyzed — previous AI-derived intelligence replaced.'
        : 'AI analysis completed.',
      metadata: {
        requirementCount: requirements.length,
        boqCount: boq.length,
        dateCount: dates.length,
        redFlagCount: redFlags.length,
      },
    });

    return updatedTender;
  });
}

/** Mark a tender's analysis as FAILED — separate from replaceAnalysis since
 *  a failure must NOT touch any previously-successful analysis data (a
 *  failed re-analysis attempt leaves the prior COMPLETED intelligence intact,
 *  it doesn't wipe it — only a SUCCESSFUL replaceAnalysis() replaces data). */
export async function markAnalysisFailed(scope, tenderId, errorMessage) {
  await scope.db
    .update(tenders)
    .set({ analysisStatus: 'FAILED', analysisError: errorMessage, updatedAt: new Date() })
    .where(eq(tenders.id, tenderId));
}
