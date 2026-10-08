import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkPages } from '../../src/bidpilot/analysis/chunker.js';

test('chunkPages', async (t) => {
  await t.test('groups consecutive pages until the char budget is hit', () => {
    const pages = [
      { pageNumber: 1, rawText: 'a'.repeat(40) },
      { pageNumber: 2, rawText: 'b'.repeat(40) },
      { pageNumber: 3, rawText: 'c'.repeat(40) },
    ];
    const chunks = chunkPages(pages, { maxChars: 60 });
    // Each page's marker is `[PAGE N]\n` + 40 chars ≈ 49-50 chars, so only
    // one page fits per chunk under a 60-char budget.
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks[0].pages, [1]);
    assert.deepEqual(chunks[1].pages, [2]);
    assert.deepEqual(chunks[2].pages, [3]);
  });

  await t.test('packs multiple small pages into one chunk under a generous budget', () => {
    const pages = [
      { pageNumber: 1, rawText: 'short' },
      { pageNumber: 2, rawText: 'also short' },
      { pageNumber: 3, rawText: 'tiny' },
    ];
    const chunks = chunkPages(pages, { maxChars: 10_000 });
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].pages, [1, 2, 3]);
  });

  await t.test('page identity is never separated from the text — every page has a [PAGE N] marker', () => {
    const pages = [{ pageNumber: 7, rawText: 'clause text here' }];
    const chunks = chunkPages(pages, { maxChars: 10_000 });
    assert.match(chunks[0].text, /\[PAGE 7\]/);
    assert.match(chunks[0].text, /clause text here/);
  });

  await t.test('a single page bigger than the whole budget still gets its own chunk, never dropped', () => {
    const pages = [{ pageNumber: 1, rawText: 'x'.repeat(500) }];
    const chunks = chunkPages(pages, { maxChars: 100 });
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].pages, [1]);
    assert.match(chunks[0].text, /x{500}/);
  });

  await t.test('an oversized page does not prevent the NEXT page from starting a fresh chunk', () => {
    const pages = [
      { pageNumber: 1, rawText: 'x'.repeat(500) },
      { pageNumber: 2, rawText: 'short' },
    ];
    const chunks = chunkPages(pages, { maxChars: 100 });
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0].pages, [1]);
    assert.deepEqual(chunks[1].pages, [2]);
  });

  await t.test('input order does not matter — pages are always processed in page-number order', () => {
    const pages = [
      { pageNumber: 3, rawText: 'c' },
      { pageNumber: 1, rawText: 'a' },
      { pageNumber: 2, rawText: 'b' },
    ];
    const chunks = chunkPages(pages, { maxChars: 10_000 });
    assert.deepEqual(chunks[0].pages, [1, 2, 3]);
  });

  await t.test('empty input produces zero chunks, not an empty chunk', () => {
    assert.deepEqual(chunkPages([]), []);
  });

  await t.test('a page with empty/null text is still represented (not skipped, not thrown on)', () => {
    const pages = [{ pageNumber: 1, rawText: null }, { pageNumber: 2, rawText: '' }];
    const chunks = chunkPages(pages, { maxChars: 10_000 });
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].pages, [1, 2]);
  });
});
