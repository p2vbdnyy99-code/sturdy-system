// The strict domain schema AI chunk-extraction output must conform to, and
// its validator. Hand-rolled (not a JSON-schema library) — the shape is flat
// enough that a library would add a dependency for what a direct check does
// more legibly, matching this codebase's existing preference for small
// hand-rolled validation over a generic framework.
// -----------------------------------------------------------------------------
// The core discipline this enforces: "valid JSON" is not the bar. A fact
// without usable evidence is DROPPED, never persisted — this is the code-level
// enforcement of "if evidence cannot be located, do not manufacture it."
// Category values are whitelisted against the real DB enum so nothing
// invalid can ever reach an insert.

export const REQUIREMENT_CATEGORIES = [
  'FINANCIAL', 'TECHNICAL', 'LEGAL', 'EXPERIENCE', 'CERTIFICATION', 'LICENSE',
  'MANPOWER', 'EQUIPMENT', 'OEM', 'DOCUMENT', 'GEOGRAPHIC', 'SPECIAL_CONDITION', 'OTHER',
];

const OVERVIEW_FIELDS = [
  'organization', 'tenderNumber', 'location', 'estimatedValue', 'emd',
  'tenderFee', 'contractDuration', 'submissionDeadline', 'openingDate',
];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
const isConfidence = (v) => v === undefined || v === null || (typeof v === 'number' && v >= 0 && v <= 1);

/**
 * Validate and normalize one chunk's raw AI JSON output.
 * @returns {{ overview: object, requirements: Array, boq: Array, dates: Array,
 *             redFlags: Array, droppedCount: number }}
 *   droppedCount: how many candidate items were discarded for lacking usable
 *   evidence — surfaced so a caller can log/monitor extraction quality
 *   without needing to re-derive it.
 */
export function validateChunkResult(raw, { validPages }) {
  const pageOk = (p) => isPositiveInt(p) && validPages.has(p);
  let dropped = 0;

  const overview = {};
  if (raw?.overview && typeof raw.overview === 'object') {
    for (const field of OVERVIEW_FIELDS) {
      const entry = raw.overview[field];
      if (!entry || typeof entry !== 'object') continue;
      if (!isNonEmptyString(entry.value)) continue;
      // Same evidence-first rule as requirements: these fields are
      // commercially load-bearing (tender value, EMD, deadlines, ...), so a
      // populated field with no real page + no real quote is dropped, not
      // persisted with a fabricated or missing citation.
      if (!pageOk(entry.sourcePage) || !isNonEmptyString(entry.evidenceText)) {
        dropped += 1;
        continue;
      }
      overview[field] = {
        value: entry.value.trim(),
        sourcePage: entry.sourcePage,
        evidenceText: entry.evidenceText.trim(),
      };
    }
  }

  const requirements = [];
  for (const r of Array.isArray(raw?.requirements) ? raw.requirements : []) {
    if (!r || typeof r !== 'object') { dropped += 1; continue; }
    if (!REQUIREMENT_CATEGORIES.includes(r.category)) { dropped += 1; continue; }
    if (!isNonEmptyString(r.description)) { dropped += 1; continue; }
    // The evidence-first rule, enforced here: no real page + no real quote
    // means this "requirement" is discarded, not persisted with a blank or
    // invented citation.
    if (!pageOk(r.sourcePage) || !isNonEmptyString(r.evidenceText)) { dropped += 1; continue; }
    requirements.push({
      category: r.category,
      title: isNonEmptyString(r.title) ? r.title.trim() : null,
      description: r.description.trim(),
      mandatory: typeof r.mandatory === 'boolean' ? r.mandatory : true,
      sourcePage: r.sourcePage,
      evidenceText: r.evidenceText.trim(),
      extractedValue: isNonEmptyString(r.extractedValue) ? r.extractedValue.trim() : null,
      confidence: isConfidence(r.confidence) ? r.confidence : null,
    });
  }

  const boq = [];
  for (const b of Array.isArray(raw?.boq) ? raw.boq : []) {
    if (!b || typeof b !== 'object') { dropped += 1; continue; }
    if (!isNonEmptyString(b.description)) { dropped += 1; continue; }
    if (!pageOk(b.sourcePage)) { dropped += 1; continue; }
    boq.push({
      itemNumber: isNonEmptyString(b.itemNumber) ? b.itemNumber.trim() : null,
      description: b.description.trim(),
      quantity: isNonEmptyString(b.quantity) ? b.quantity.trim() : null,
      unit: isNonEmptyString(b.unit) ? b.unit.trim() : null,
      technicalSpecification: isNonEmptyString(b.technicalSpecification) ? b.technicalSpecification.trim() : null,
      remarks: isNonEmptyString(b.remarks) ? b.remarks.trim() : null,
      sourcePage: b.sourcePage,
    });
  }

  const dates = [];
  for (const d of Array.isArray(raw?.dates) ? raw.dates : []) {
    if (!d || typeof d !== 'object') { dropped += 1; continue; }
    if (!isNonEmptyString(d.label) || !isNonEmptyString(d.rawText)) { dropped += 1; continue; }
    if (!pageOk(d.sourcePage)) { dropped += 1; continue; }
    const parsedDate = isNonEmptyString(d.parsedDate) && !Number.isNaN(Date.parse(d.parsedDate))
      ? new Date(d.parsedDate) : null;
    dates.push({
      label: d.label.trim(),
      rawText: d.rawText.trim(),
      parsedDate,
      sourcePage: d.sourcePage,
      evidenceText: isNonEmptyString(d.evidenceText) ? d.evidenceText.trim() : null,
    });
  }

  const redFlags = [];
  for (const f of Array.isArray(raw?.redFlags) ? raw.redFlags : []) {
    if (!f || typeof f !== 'object') { dropped += 1; continue; }
    if (!isNonEmptyString(f.description)) { dropped += 1; continue; }
    if (!pageOk(f.sourcePage)) { dropped += 1; continue; }
    redFlags.push({
      description: f.description.trim(),
      sourcePage: f.sourcePage,
      evidenceText: isNonEmptyString(f.evidenceText) ? f.evidenceText.trim() : null,
    });
  }

  return { overview, requirements, boq, dates, redFlags, droppedCount: dropped };
}
