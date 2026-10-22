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

import { parseTenderDate } from './dates.js';

export const REQUIREMENT_CATEGORIES = [
  'FINANCIAL', 'TECHNICAL', 'LEGAL', 'EXPERIENCE', 'CERTIFICATION', 'LICENSE',
  'MANPOWER', 'EQUIPMENT', 'OEM', 'DOCUMENT', 'GEOGRAPHIC', 'SPECIAL_CONDITION', 'OTHER',
];

export const OVERVIEW_FIELDS = [
  'organization', 'tenderNumber', 'location', 'estimatedValue', 'emd',
  'tenderFee', 'contractDuration', 'submissionDeadline', 'openingDate',
];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Overview date fields; the model also returns parsedDate for these.
const DATE_OVERVIEW_FIELDS = new Set(['submissionDeadline', 'openingDate']);

/** Models sometimes write the page as a string ("2"); that is still a real
 *  page number. Anything else (e.g. "p.2", "2-3") is not accepted. */
const toPage = (p) => (typeof p === 'string' && /^\d+$/.test(p.trim()) ? Number(p.trim()) : p);

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
const NUMBER_THEN_UNIT = /^([+-]?\d+(?:\.\d+)?)\s*([A-Za-z][A-Za-z.\s/]*)$/;
const INDIAN_GROUPING = /^[+-]?\d{1,2}(,\d{2})*,\d{3}$/;
const WESTERN_GROUPING = /^[+-]?\d{1,3}(,\d{3})+$/;
const MULTIPLIER_WORDS = /^(lakhs?|lacs?|crores?|cr|thousands?|hundreds?|k|mn|million)\b/i;

/**
 * tender_boq_items.quantity is a numeric column, but BOQs write quantities
 * as "2,150", "1,27,300.50", "1 No." or "LS". Any non-number used to make
 * the insert throw and fail the whole analysis. Returns what to store:
 * a plain number string, a unit split off "1 No." when none was given, and
 * otherwise null with the text as written kept for the remarks — never a
 * guessed number.
 */
export function normalizeBoqQuantity(raw, givenUnit = null) {
  if (!isNonEmptyString(raw)) return { quantity: null, unit: null, asWritten: null };
  const text = raw.trim();
  if (/^[-\u2013\u2014]+$/.test(text)) return { quantity: null, unit: null, asWritten: null };
  // Thousands separators, but only in a real grouping: Indian 1,27,300 or
  // Western 127,300. Anything else with a comma ("1,5", "10,20") is kept as
  // written rather than guessed.
  const lead = text.match(/^([+-]?[\d,]+)(.*)$/s);
  let compact = text;
  if (lead && lead[1].includes(',')) {
    if (!INDIAN_GROUPING.test(lead[1]) && !WESTERN_GROUPING.test(lead[1])) {
      return { quantity: null, unit: null, asWritten: text };
    }
    compact = lead[1].replace(/,/g, '') + lead[2];
  }
  if (PLAIN_NUMBER.test(compact)) return { quantity: compact, unit: null, asWritten: null };
  const withUnit = compact.match(NUMBER_THEN_UNIT);
  if (withUnit) {
    const unit = withUnit[2].trim();
    const norm = (u) => u.toLowerCase().replace(/[.\s]/g, '');
    // "1.5 lakh" is a multiplier, not a unit; and a trailing word that
    // disagrees with the unit given separately can't be resolved safely.
    const isMultiplier = MULTIPLIER_WORDS.test(unit);
    const agrees = !isNonEmptyString(givenUnit) || norm(givenUnit) === norm(unit);
    if (!isMultiplier && agrees) return { quantity: withUnit[1], unit, asWritten: null };
  }
  return { quantity: null, unit: null, asWritten: text };
}
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
  // Normalise string page numbers on every item before validating.
  for (const key of ['requirements', 'boq', 'dates', 'redFlags']) {
    if (Array.isArray(raw?.[key])) {
      for (const item of raw[key]) if (item && typeof item === 'object') item.sourcePage = toPage(item.sourcePage);
    }
  }
  if (raw?.overview && typeof raw.overview === 'object') {
    for (const entry of Object.values(raw.overview)) if (entry && typeof entry === 'object') entry.sourcePage = toPage(entry.sourcePage);
  }
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
      if (DATE_OVERVIEW_FIELDS.has(field)) {
        // Strict Indian reading (day/month/year, IST) of the model's date,
        // falling back to the value as written; null if neither is a date.
        overview[field].parsedDate = parseTenderDate(entry.parsedDate) ?? parseTenderDate(entry.value);
      }
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
    const qty = normalizeBoqQuantity(typeof b.quantity === 'number' ? String(b.quantity) : b.quantity, b.unit);
    const remarks = isNonEmptyString(b.remarks) ? b.remarks.trim() : null;
    boq.push({
      itemNumber: isNonEmptyString(b.itemNumber) ? b.itemNumber.trim() : null,
      description: b.description.trim(),
      quantity: qty.quantity,
      unit: isNonEmptyString(b.unit) ? b.unit.trim() : qty.unit,
      technicalSpecification: isNonEmptyString(b.technicalSpecification) ? b.technicalSpecification.trim() : null,
      remarks: qty.asWritten
        ? (remarks ? `${remarks}; quantity as written: ${qty.asWritten}` : `Quantity as written: ${qty.asWritten}`)
        : remarks,
      sourcePage: b.sourcePage,
    });
  }

  const dates = [];
  for (const d of Array.isArray(raw?.dates) ? raw.dates : []) {
    if (!d || typeof d !== 'object') { dropped += 1; continue; }
    if (!isNonEmptyString(d.label) || !isNonEmptyString(d.rawText)) { dropped += 1; continue; }
    if (!pageOk(d.sourcePage)) { dropped += 1; continue; }
    // Never Date.parse: it reads 02/05/2026 as 5 February. See dates.js.
    const parsedDate = parseTenderDate(d.parsedDate) ?? parseTenderDate(d.rawText);
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
