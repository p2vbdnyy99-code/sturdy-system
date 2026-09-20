// The Milestone 4 analysis pipeline:
//   tender_pages -> chunk (char-budget, page identity preserved)
//                -> per-chunk AI extraction -> validate -> aggregate
//                -> replace-persist -> analysisStatus
// -----------------------------------------------------------------------------
// Runs off the request path via setImmediate, same idiom as Milestone 2's
// extraction pipeline and Papyr's webhook handler — the route acknowledges
// immediately (analysisStatus already flipped to ANALYZING synchronously,
// see routes/tenders.js), this does the real work after.
//
// Partial-success policy: one chunk failing to parse does not sink the whole
// analysis (a 150-page tender shouldn't lose everything because one chunk's
// JSON was malformed) — but if NO chunk produced anything usable, or a
// hard error occurs before any chunk runs (e.g. the provider itself is down),
// the analysis is marked FAILED and any PREVIOUS successful analysis is left
// completely untouched (see repo/analysis.js's markAnalysisFailed — only a
// SUCCESSFUL run ever replaces data).

import { log } from '../../logger.js';
import { config } from '../../config.js';
import { chunkPages } from './chunker.js';
import { extractChunk } from './extract.js';
import { validateChunkResult } from './schema.js';
import { aggregateResults } from './aggregate.js';
import { recordChunkUsage } from './budget.js';
import { listPages } from '../repo/pages.js';
import { replaceAnalysis, markAnalysisFailed } from '../repo/analysis.js';

const MAX_ERROR_CHARS = 500;
const safeErrorMessage = (err) => String(err?.message || err || 'Unknown error').slice(0, MAX_ERROR_CHARS);

/**
 * @param {boolean} isReanalysis — whether a previous COMPLETED analysis
 *   already exists (drives the tender_events wording — see repo/analysis.js)
 */
export async function runAnalysis(scope, tenderId, { isReanalysis } = {}) {
  const start = Date.now();
  try {
    const pages = await listPages(scope, tenderId);
    const chunks = chunkPages(pages, { maxChars: config.bidpilot.analysis.chunkChars });

    const chunkResults = [];
    let chunkFailures = 0;

    for (const chunk of chunks) {
      const validPages = new Set(chunk.pages);
      try {
        const raw = await extractChunk(chunk);
        if (raw === null) {
          chunkFailures += 1;
          log.warn(`bidpilot analysis: chunk pages=${chunk.pages.join(',')} produced unparseable output`);
          continue;
        }
        chunkResults.push(validateChunkResult(raw, { validPages }));
        await recordChunkUsage(scope.db, {
          companyId: scope.companyId,
          tenderId,
          metadata: { pages: chunk.pages },
        });
      } catch (err) {
        chunkFailures += 1;
        log.warn(`bidpilot analysis: chunk pages=${chunk.pages.join(',')} failed:`, err.message);
      }
    }

    if (!chunkResults.length) {
      throw new Error(
        chunks.length ? `All ${chunks.length} analysis chunk(s) failed.` : 'Tender has no extracted pages to analyze.',
      );
    }

    const aggregated = aggregateResults(chunkResults);
    await replaceAnalysis(scope, tenderId, aggregated, { isReanalysis });

    log.info(
      `metric bidpilot_analysis company=${scope.companyId} tender=${tenderId} ` +
        `chunks=${chunks.length} failures=${chunkFailures} requirements=${aggregated.requirements.length} ` +
        `boq=${aggregated.boq.length} dates=${aggregated.dates.length} redFlags=${aggregated.redFlags.length} ` +
        `dropped=${aggregated.droppedCount} ms=${Date.now() - start} status=COMPLETED`,
    );
  } catch (err) {
    const message = safeErrorMessage(err);
    await markAnalysisFailed(scope, tenderId, message).catch((persistErr) => {
      log.error(`bidpilot: could not persist FAILED analysis status for tender=${tenderId}:`, persistErr);
    });
    log.info(
      `metric bidpilot_analysis_error company=${scope.companyId} tender=${tenderId} ` +
        `kind=${err?.name || 'Error'} ms=${Date.now() - start}`,
    );
  }
}
