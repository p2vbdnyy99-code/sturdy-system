// Runs via `node --test src/tenders/landingData.test.ts` (Node 22 type stripping).
// The server's list data is for the first page load only (landingData.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLandingDataReader, LANDING_DATA_ID } from './landingData.ts';

const PAGE = { path: '/government-tenders/state/kerala', kind: 'state', state: 'Kerala', label: 'Kerala', count: 40 };
const DATA = { page: PAGE, facets: { open: { central: 1, state: 2, gem: 3 } }, result: { tenders: [], total: 0 } };

function fakeDoc(text: string | null) {
  const state = { removed: 0, reads: 0, present: text !== null };
  const doc = {
    getElementById(id: string) {
      if (id !== LANDING_DATA_ID || !state.present) return null;
      state.reads += 1;
      return { textContent: text, remove() { state.removed += 1; state.present = false; } };
    },
  };
  return { doc, state };
}

test('the first render of the loaded list page gets the data; the block is read once and removed', () => {
  const { doc, state } = fakeDoc(JSON.stringify(DATA));
  const reader = createLandingDataReader(() => doc);
  const first = reader.embedded(PAGE.path);
  assert.equal(first?.page.path, PAGE.path);
  // React may call the initializer twice before the page is shown (StrictMode).
  assert.equal(reader.embedded(PAGE.path)?.page.path, PAGE.path);
  assert.equal(state.reads, 1);
  assert.equal(state.removed, 1, 'taken out of the page');
});

test('after the page has been shown, coming back to the same list gets no stale data', () => {
  const { doc } = fakeDoc(JSON.stringify(DATA));
  const reader = createLandingDataReader(() => doc);
  assert.ok(reader.embedded(PAGE.path));
  reader.markUsed();
  assert.equal(reader.embedded(PAGE.path), null, 'fetched fresh instead');
});

test('another path, no block, or a broken block gives nothing', () => {
  const ok = createLandingDataReader(() => fakeDoc(JSON.stringify(DATA)).doc);
  assert.equal(ok.embedded('/government-tenders/state/goa'), null);
  assert.equal(createLandingDataReader(() => fakeDoc(null).doc).embedded(PAGE.path), null);
  assert.equal(createLandingDataReader(() => fakeDoc('{not json').doc).embedded(PAGE.path), null);
  assert.equal(createLandingDataReader(() => fakeDoc(JSON.stringify({ page: PAGE })).doc).embedded(PAGE.path), null, 'incomplete data');
  assert.equal(createLandingDataReader(() => undefined).embedded(PAGE.path), null, 'no document (server render)');
});
