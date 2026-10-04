// The evidence-first enforcement point for AI output: a candidate fact
// without a real, in-chunk page citation is DROPPED, never persisted with a
// blank/fabricated one. This is the code-level guarantee behind "if evidence
// cannot be located, do not manufacture it."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChunkResult, normalizeBoqQuantity, REQUIREMENT_CATEGORIES } from '../../src/bidpilot/analysis/schema.js';

const validPages = new Set([1, 2, 3]);

test('validateChunkResult — requirements', async (t) => {
  await t.test('accepts a fully-formed, evidenced requirement', () => {
    const out = validateChunkResult({
      requirements: [{
        category: 'FINANCIAL', title: 'Turnover', description: 'Min turnover Rs 5 crore',
        mandatory: true, sourcePage: 2, evidenceText: 'quoted text', extractedValue: 'Rs 5 crore', confidence: 0.9,
      }],
    }, { validPages });
    assert.equal(out.requirements.length, 1);
    assert.equal(out.requirements[0].category, 'FINANCIAL');
    assert.equal(out.requirements[0].sourcePage, 2);
    assert.equal(out.droppedCount, 0);
  });

  await t.test('drops a requirement missing sourcePage (never fabricate a citation)', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'FINANCIAL', description: 'x', evidenceText: 'quote' }],
    }, { validPages });
    assert.equal(out.requirements.length, 0);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('drops a requirement missing evidenceText', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'FINANCIAL', description: 'x', sourcePage: 1 }],
    }, { validPages });
    assert.equal(out.requirements.length, 0);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('drops a requirement citing a page NOT in this chunk (hallucinated citation)', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'FINANCIAL', description: 'x', sourcePage: 999, evidenceText: 'quote' }],
    }, { validPages });
    assert.equal(out.requirements.length, 0);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('drops a requirement with an invalid category', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'MADE_UP_CATEGORY', description: 'x', sourcePage: 1, evidenceText: 'quote' }],
    }, { validPages });
    assert.equal(out.requirements.length, 0);
  });

  await t.test('drops a requirement with an empty description', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'FINANCIAL', description: '   ', sourcePage: 1, evidenceText: 'quote' }],
    }, { validPages });
    assert.equal(out.requirements.length, 0);
  });

  await t.test('defaults mandatory to true when absent, but accepts an explicit false', () => {
    const out = validateChunkResult({
      requirements: [
        { category: 'OTHER', description: 'a', sourcePage: 1, evidenceText: 'q' },
        { category: 'OTHER', description: 'b', sourcePage: 1, evidenceText: 'q', mandatory: false },
      ],
    }, { validPages });
    assert.equal(out.requirements[0].mandatory, true);
    assert.equal(out.requirements[1].mandatory, false);
  });

  await t.test('rejects an out-of-range confidence but keeps the requirement (confidence just becomes null)', () => {
    const out = validateChunkResult({
      requirements: [{ category: 'OTHER', description: 'a', sourcePage: 1, evidenceText: 'q', confidence: 5 }],
    }, { validPages });
    assert.equal(out.requirements.length, 1);
    assert.equal(out.requirements[0].confidence, null);
  });

  await t.test('every real category in the enum round-trips', () => {
    for (const category of REQUIREMENT_CATEGORIES) {
      const out = validateChunkResult({
        requirements: [{ category, description: 'x', sourcePage: 1, evidenceText: 'q' }],
      }, { validPages });
      assert.equal(out.requirements.length, 1, category);
    }
  });
});

test('validateChunkResult — boq/dates/redFlags/overview', async (t) => {
  await t.test('boq item requires sourcePage; drops without it', () => {
    const withPage = validateChunkResult({ boq: [{ description: 'Cement', sourcePage: 1 }] }, { validPages });
    const withoutPage = validateChunkResult({ boq: [{ description: 'Cement' }] }, { validPages });
    assert.equal(withPage.boq.length, 1);
    assert.equal(withoutPage.boq.length, 0);
  });

  await t.test('date requires label, rawText, and sourcePage', () => {
    const valid = validateChunkResult({
      dates: [{ label: 'Pre-bid meeting', rawText: '12 Oct 2026', sourcePage: 1, evidenceText: 'q' }],
    }, { validPages });
    assert.equal(valid.dates.length, 1);
    assert.equal(valid.dates[0].label, 'Pre-bid meeting');

    const missingRawText = validateChunkResult({ dates: [{ label: 'x', sourcePage: 1 }] }, { validPages });
    assert.equal(missingRawText.dates.length, 0);
  });

  await t.test('a parseable parsedDate becomes a real Date; an unparseable one is dropped, not kept as garbage', () => {
    const good = validateChunkResult({
      dates: [{ label: 'x', rawText: '12 Oct 2026', parsedDate: '2026-10-12', sourcePage: 1 }],
    }, { validPages });
    assert.ok(good.dates[0].parsedDate instanceof Date);

    const bad = validateChunkResult({
      dates: [{ label: 'x', rawText: 'within 15 days', parsedDate: 'not-a-real-date', sourcePage: 1 }],
    }, { validPages });
    assert.equal(bad.dates[0].parsedDate, null, 'raw text is kept, but garbage parsedDate is not');
  });

  await t.test('red flag requires description and sourcePage', () => {
    const valid = validateChunkResult({ redFlags: [{ description: 'One-sided clause', sourcePage: 1 }] }, { validPages });
    assert.equal(valid.redFlags.length, 1);
    const invalid = validateChunkResult({ redFlags: [{ description: 'x' }] }, { validPages });
    assert.equal(invalid.redFlags.length, 0);
  });

  await t.test('overview field with a real in-chunk sourcePage is kept', () => {
    const out = validateChunkResult({
      overview: { organization: { value: 'Acme', sourcePage: 1, evidenceText: 'Acme Corp' } },
    }, { validPages });
    assert.equal(out.overview.organization.value, 'Acme');
    assert.equal(out.overview.organization.sourcePage, 1);
  });

  await t.test('overview field with a hallucinated sourcePage is dropped entirely', () => {
    const out = validateChunkResult({
      overview: { organization: { value: 'Acme', sourcePage: 999, evidenceText: 'Acme Corp' } },
    }, { validPages });
    assert.equal(out.overview.organization, undefined);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('overview field with NO sourcePage at all is dropped — evidence is required, same as requirements', () => {
    const out = validateChunkResult({
      overview: { location: { value: 'Mumbai' } },
    }, { validPages });
    assert.equal(out.overview.location, undefined);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('overview field with a sourcePage but no evidenceText is dropped — commercially important fields need both', () => {
    const out = validateChunkResult({
      overview: { estimatedValue: { value: 'Rs 5 crore', sourcePage: 1 } },
    }, { validPages });
    assert.equal(out.overview.estimatedValue, undefined);
    assert.equal(out.droppedCount, 1);
  });

  await t.test('an unknown overview field is silently ignored (whitelist, not passthrough)', () => {
    const out = validateChunkResult({
      overview: { notARealField: { value: 'x' } },
    }, { validPages });
    assert.deepEqual(out.overview, {});
  });
});

test('validateChunkResult — malformed top-level input never throws', async (t) => {
  await t.test('null/undefined input produces an empty, valid result', () => {
    const out = validateChunkResult(null, { validPages });
    assert.deepEqual(out.requirements, []);
    assert.deepEqual(out.overview, {});
  });

  await t.test('non-array requirements/boq/dates/redFlags are treated as empty, not thrown on', () => {
    const out = validateChunkResult({ requirements: 'not an array', boq: 42 }, { validPages });
    assert.deepEqual(out.requirements, []);
    assert.deepEqual(out.boq, []);
  });

  await t.test('a garbage entry inside an array is dropped, not thrown on', () => {
    const out = validateChunkResult({ requirements: [null, 'string', 42, { category: 'OTHER', description: 'ok', sourcePage: 1, evidenceText: 'q' }] }, { validPages });
    assert.equal(out.requirements.length, 1);
    assert.equal(out.droppedCount, 3);
  });
});

// tender_boq_items.quantity is numeric; anything stored there must be a plain
// number, and anything that can't safely be read as one is kept as written.
test('normalizeBoqQuantity', async (t) => {
  const q = (raw, unit = null) => normalizeBoqQuantity(raw, unit);

  await t.test('plain numbers and real thousands groupings become numbers', () => {
    assert.deepEqual(q('420'), { quantity: '420', unit: null, asWritten: null });
    assert.equal(q('2,150').quantity, '2150');
    assert.equal(q('1,27,300.50').quantity, '127300.50');
    assert.equal(q('12,34,56,789').quantity, '123456789');
    assert.equal(q('127,300').quantity, '127300');
    assert.equal(q(' 7 ').quantity, '7');
  });

  await t.test('a number followed by its unit is split, when the unit agrees', () => {
    assert.deepEqual(q('1 No.'), { quantity: '1', unit: 'No.', asWritten: null });
    assert.deepEqual(q('2,150 sqm'), { quantity: '2150', unit: 'sqm', asWritten: null });
    assert.equal(q('420 Cum.', 'cum').quantity, '420');
  });

  await t.test('never guesses: ambiguous values are kept as written, quantity null', () => {
    for (const raw of ['LS', 'As required', '1,5', '10,20', '12 345', '10 x 20']) {
      assert.deepEqual(q(raw), { quantity: null, unit: null, asWritten: raw }, raw);
    }
    // A multiplier is not a unit, and a unit that contradicts the given one can't be resolved.
    assert.deepEqual(q('1.5 lakh', 'cum'), { quantity: null, unit: null, asWritten: '1.5 lakh' });
    assert.deepEqual(q('10 sqm', 'cum'), { quantity: null, unit: null, asWritten: '10 sqm' });
  });

  await t.test('blank and dash mean no quantity, with nothing to keep', () => {
    for (const raw of [null, undefined, '', '  ', '-', '—']) {
      assert.deepEqual(q(raw), { quantity: null, unit: null, asWritten: null });
    }
  });

  await t.test('validateChunkResult keeps the original text in remarks', () => {
    const out = validateChunkResult({
      boq: [
        { description: 'Shifting', quantity: 'LS', sourcePage: 1 },
        { description: 'Dewatering', quantity: 'As required', remarks: 'If needed', sourcePage: 1 },
        { description: 'Gate', quantity: 1, sourcePage: 1 },
      ],
    }, { validPages });
    assert.equal(out.boq[0].quantity, null);
    assert.equal(out.boq[0].remarks, 'Quantity as written: LS');
    assert.equal(out.boq[1].remarks, 'If needed; quantity as written: As required');
    assert.equal(out.boq[2].quantity, '1');
  });
});
