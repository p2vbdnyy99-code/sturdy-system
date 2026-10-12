import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineSummary, eligibilityWasChecked } from './deadlineSummary.ts';

const now = new Date(2026, 9, 12, 10, 0);
const day = (n: number) => new Date(2026, 9, 12 + n, 15, 0).toISOString();
const req = (companyStatus: 'MEETS' | 'DOES_NOT_APPEAR_TO_MEET' | 'UNKNOWN') => ({ companyStatus });

test('days left, today, closed and no deadline', () => {
  const s = deadlineSummary(day(5), [], false, now);
  assert.equal(s.figure, '5'); assert.equal(s.unit, 'days left'); assert.match(s.byLine, /^Submit by 17 Oct 2026\.$/);
  assert.equal(deadlineSummary(day(1), [], false, now).unit, 'day left');
  assert.equal(deadlineSummary(day(0), [], false, now).figure, 'Today');
  const closed = deadlineSummary(day(-2), [], false, now);
  assert.equal(closed.figure, 'Closed'); assert.match(closed.byLine, /^The deadline was/);
  const none = deadlineSummary(null, [], false, now);
  assert.equal(none.figure, '—'); assert.equal(none.byLine, 'No submission deadline was found in the document.');
});

test('before the eligibility check: counts requirements, no verdict', () => {
  const s = deadlineSummary(day(5), [req('UNKNOWN'), req('UNKNOWN')], false, now);
  assert.equal(s.eligibility, null);
  assert.equal(s.headline, '2 requirements found. Eligibility not checked yet.');
  assert.equal(deadlineSummary(day(5), [], false, now).headline, 'No requirements were found in the document.');
});

test('after the check: met, not met and unclear counts', () => {
  const s = deadlineSummary(day(5), [req('MEETS'), req('MEETS'), req('DOES_NOT_APPEAR_TO_MEET'), req('UNKNOWN')], false, now);
  assert.deepEqual(s.eligibility, { met: 2, notMet: 1, unknown: 1 });
  assert.equal(s.headline, '2 of 4 requirements appear met by your profile');
  assert.doesNotMatch(JSON.stringify(s), /\b(bid|should|recommend)\b/i);
});

test('a check that left every requirement unclear still counts as checked', () => {
  const s = deadlineSummary(day(5), [req('UNKNOWN'), req('UNKNOWN')], true, now);
  assert.deepEqual(s.eligibility, { met: 0, notMet: 0, unknown: 2 });
  assert.equal(s.headline, '0 of 2 requirements appear met by your profile');
});

test('eligibilityWasChecked: only a check after the latest analysis counts', () => {
  const ev = (eventType: string, h: number) => ({ eventType, createdAt: new Date(2026, 9, 12, h).toISOString() });
  assert.equal(eligibilityWasChecked([]), false);
  assert.equal(eligibilityWasChecked([ev('analysis_completed', 9), ev('eligibility_checked', 10)]), true);
  assert.equal(eligibilityWasChecked([ev('analysis_completed', 9), ev('eligibility_checked', 10), ev('analysis_replaced', 11)]), false);
  assert.equal(eligibilityWasChecked([ev('analysis_completed', 9)]), false);
});
