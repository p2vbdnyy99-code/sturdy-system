// The evidence-first enforcement point for AI output: a candidate fact
// without a real, in-chunk page citation is DROPPED, never persisted with a
// blank/fabricated one. This is the code-level guarantee behind "if evidence
// cannot be located, do not manufacture it."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChunkResult, REQUIREMENT_CATEGORIES } from '../../src/bidpilot/analysis/schema.js';

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
