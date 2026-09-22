import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateResults } from '../../src/bidpilot/analysis/aggregate.js';

const empty = () => ({ overview: {}, requirements: [], boq: [], dates: [], redFlags: [], droppedCount: 0 });

test('aggregateResults', async (t) => {
  await t.test('concatenates requirements/boq/dates/redFlags across chunks', () => {
    const a = { ...empty(), requirements: [{ description: 'r1' }], boq: [{ description: 'b1' }] };
    const b = { ...empty(), requirements: [{ description: 'r2' }], dates: [{ label: 'd1' }] };
    const out = aggregateResults([a, b]);
    assert.deepEqual(out.requirements.map((r) => r.description), ['r1', 'r2']);
    assert.equal(out.boq.length, 1);
    assert.equal(out.dates.length, 1);
  });

  await t.test('overview: the EARLIEST chunk to provide a field wins (chunks are in page order)', () => {
    const first = { ...empty(), overview: { organization: { value: 'Acme (cover page)', sourcePage: 1 } } };
    const later = { ...empty(), overview: { organization: { value: 'Some other mention', sourcePage: 40 } } };
    const out = aggregateResults([first, later]);
    assert.equal(out.overview.organization.value, 'Acme (cover page)');
  });

  await t.test('overview: fields from DIFFERENT chunks are merged, not overwritten', () => {
    const first = { ...empty(), overview: { organization: { value: 'Acme', sourcePage: 1 } } };
    const later = { ...empty(), overview: { location: { value: 'Mumbai', sourcePage: 5 } } };
    const out = aggregateResults([first, later]);
    assert.equal(out.overview.organization.value, 'Acme');
    assert.equal(out.overview.location.value, 'Mumbai');
  });

  await t.test('droppedCount sums across all chunks', () => {
    const out = aggregateResults([{ ...empty(), droppedCount: 2 }, { ...empty(), droppedCount: 3 }]);
    assert.equal(out.droppedCount, 5);
  });

  await t.test('an empty chunk list produces an empty, valid result', () => {
    const out = aggregateResults([]);
    assert.deepEqual(out.requirements, []);
    assert.deepEqual(out.overview, {});
    assert.equal(out.droppedCount, 0);
  });
});
