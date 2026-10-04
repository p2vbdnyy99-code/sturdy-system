// Runs via `node --test src/format.test.ts` (Node 22 type stripping), like
// dashboard/attentionState.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, displayTitle, formatDate, humanizeEnum, relativeDays } from './format.ts';

const NOW = new Date(2026, 9, 4, 15, 30); // 4 Oct 2026, 15:30 local

test('formatDate gives an unambiguous day-month-year', () => {
  assert.equal(formatDate(new Date(2026, 9, 9).toISOString()), '9 Oct 2026');
});

test('formatDate returns null for missing or non-date values', () => {
  assert.equal(formatDate(null), null);
  assert.equal(formatDate(''), null);
  assert.equal(formatDate('as per CPPP'), null);
});

test('daysUntil counts calendar days, ignoring the time of day', () => {
  assert.equal(daysUntil(new Date(2026, 9, 4, 9, 0).toISOString(), NOW), 0);
  assert.equal(daysUntil(new Date(2026, 9, 5, 0, 1).toISOString(), NOW), 1);
  assert.equal(daysUntil(new Date(2026, 9, 9, 23, 0).toISOString(), NOW), 5);
  assert.equal(daysUntil(new Date(2026, 9, 1).toISOString(), NOW), -3);
  assert.equal(daysUntil(null, NOW), null);
});

test('relativeDays wording', () => {
  assert.equal(relativeDays(new Date(2026, 9, 4).toISOString(), NOW), 'today');
  assert.equal(relativeDays(new Date(2026, 9, 5).toISOString(), NOW), 'tomorrow');
  assert.equal(relativeDays(new Date(2026, 9, 3).toISOString(), NOW), 'yesterday');
  assert.equal(relativeDays(new Date(2026, 9, 9).toISOString(), NOW), 'in 5 days');
  assert.equal(relativeDays(new Date(2026, 9, 1).toISOString(), NOW), '3 days ago');
  assert.equal(relativeDays('not a date', NOW), null);
});

test('displayTitle drops the .pdf extension and never returns blank', () => {
  assert.equal(displayTitle('sbi_civil.pdf'), 'sbi_civil');
  assert.equal(displayTitle('Tender Notice.PDF'), 'Tender Notice');
  assert.equal(displayTitle('Construction of hostel block'), 'Construction of hostel block');
  assert.equal(displayTitle(null), 'Untitled tender');
  assert.equal(displayTitle('  .pdf '), 'Untitled tender');
});

test('humanizeEnum', () => {
  assert.equal(humanizeEnum('PREPARING_BID'), 'Preparing bid');
  assert.equal(humanizeEnum('NOT_STARTED'), 'Not started');
  assert.equal(humanizeEnum('NEW'), 'New');
});
