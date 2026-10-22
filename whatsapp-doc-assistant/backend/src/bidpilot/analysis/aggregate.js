// Deterministic merge of per-chunk validated results — no extra AI call.
// -----------------------------------------------------------------------------
// Chunks don't overlap (see chunker.js), so cross-chunk duplicate extraction
// of the same fact is expected to be rare, not engineered around here with
// fuzzy matching — a known, accepted v1 limitation (see
// BIDPILOT_ARCHITECTURE.md "Milestone 4").

/**
 * @param {Array<ReturnType<typeof import('./schema.js').validateChunkResult>>} chunkResults
 *   in chunk/page order — overview merge relies on this to prefer the
 *   earliest-in-document value (a tender's number/org page is normally the
 *   cover page, i.e. the first chunk).
 */
export function aggregateResults(chunkResults) {
  const overview = {};
  const requirements = [];
  const boq = [];
  const dates = [];
  const redFlags = [];
  let droppedCount = 0;

  for (const r of chunkResults) {
    for (const [field, entry] of Object.entries(r.overview || {})) {
      // First chunk (= earliest pages) to provide a field wins.
      if (!(field in overview)) overview[field] = entry;
    }
    requirements.push(...r.requirements);
    boq.push(...r.boq);
    dates.push(...r.dates);
    redFlags.push(...r.redFlags);
    droppedCount += r.droppedCount;
  }

  return { overview, requirements, boq, dates, redFlags, droppedCount };
}
