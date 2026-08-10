// Session persistence — the router→session→converter seam.
// -----------------------------------------------------------------------------
// Regression coverage for a production bug that every other test missed: the
// structured converters (buildDocModel/buildDocx/xlsx) were all exercised
// DIRECTLY, so none noticed that setDocument silently dropped `spanPages`.
// In production that forced every Word conversion to the flat-text fallback
// and made Excel always report "no table" — the whole structured engine was
// dead code behind a lost field. These tests assert the fields the converters
// depend on actually survive a store→fetch round-trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDocument, getSession } from '../src/sessions.js';

test('setDocument persists spanPages (the field the Word/Excel converters branch on)', () => {
  const spanPages = [{ page: 1, width: 595, height: 842, spans: [{ text: 'Hi', x: 1, y: 1, w: 1, h: 1 }] }];
  setDocument('user-a', { text: 'Hi', filename: 'doc.pdf', spanPages, ocrUsed: false });

  const s = getSession('user-a');
  assert.ok(s, 'session exists');
  assert.ok(s.doc.spanPages, 'spanPages survived the round-trip');
  assert.equal(s.doc.spanPages.length, 1);
  assert.equal(s.doc.spanPages[0].spans[0].text, 'Hi');
});

test('the exact convert_word branch condition is truthy when spans were provided', () => {
  // Mirrors router.js: `doc.spanPages && doc.spanPages.length ? structured : flat`.
  // If this is falsy after a normal ingest, production silently emits flat text.
  const spanPages = [{ page: 1, spans: [{ text: 'x' }] }];
  setDocument('user-b', { text: 'x', filename: 'd.pdf', spanPages, ocrUsed: false });
  const { doc } = getSession('user-b');
  assert.ok(doc.spanPages && doc.spanPages.length, 'structured path would be taken, not the flat fallback');
});

test('the Excel guard does NOT falsely trigger the no-table fallback when spans exist', () => {
  // Mirrors convertToExcel: `if (!doc.spanPages || !doc.spanPages.length) return NO_TABLE`.
  const spanPages = [{ page: 1, spans: [{ text: 'A' }, { text: 'B' }] }];
  setDocument('user-c', { text: 'A B', filename: 'd.pdf', spanPages, ocrUsed: false });
  const { doc } = getSession('user-c');
  assert.ok(!(!doc.spanPages || !doc.spanPages.length), 'table detection would run, not be skipped');
});

test('other document fields still round-trip (no field was displaced by the fix)', () => {
  setDocument('user-d', { text: 'body', filename: 'f.pdf', spanPages: [], ocrUsed: true });
  const { doc } = getSession('user-d');
  assert.equal(doc.text, 'body');
  assert.equal(doc.filename, 'f.pdf');
  assert.equal(doc.ocrUsed, true);
});

test('firstTouch returns true only on a sender\'s first message', async () => {
  const { firstTouch } = await import('../src/sessions.js');
  const u = 'sender-first-touch-1';
  assert.equal(firstTouch(u), true, 'first time -> welcome fires');
  assert.equal(firstTouch(u), false, 'second time -> no welcome');
  assert.equal(firstTouch(u), false, 'still no welcome');
  assert.equal(firstTouch('a-different-sender'), true, 'a new sender is welcomed');
});

test('feedback pending is one-shot and per-sender (works without a document)', async () => {
  const { setFeedbackPending, takeFeedbackPending } = await import('../src/sessions.js');

  // No prompt yet -> nothing pending.
  assert.equal(takeFeedbackPending('fb-user-1'), false, 'nothing pending by default');

  // After we prompt, the NEXT message is captured — exactly once.
  setFeedbackPending('fb-user-1');
  assert.equal(takeFeedbackPending('fb-user-1'), true, 'first message captured as feedback');
  assert.equal(takeFeedbackPending('fb-user-1'), false, 'not captured twice');

  // The flag is per-sender: prompting one user doesn't arm another.
  setFeedbackPending('fb-user-2');
  assert.equal(takeFeedbackPending('fb-user-3'), false, 'a different sender is unaffected');
  assert.equal(takeFeedbackPending('fb-user-2'), true, 'the prompted sender is captured');
});
