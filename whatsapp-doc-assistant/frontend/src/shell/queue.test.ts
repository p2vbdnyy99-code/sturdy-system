import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, filterQueue, isDueSoon } from './queue.ts';

const now = new Date(2026, 9, 12, 10, 0); // 12 Oct 2026, 10:00 local
const day = (n: number) => new Date(2026, 9, 12 + n, 18, 0).toISOString();

test('dueLabel: today, days left, closed and missing', () => {
  assert.deepEqual(dueLabel(day(0), now), { text: 'Today', tone: 'urgent', title: 'Due today' });
  assert.equal(dueLabel(day(1), now).text, '1 day');
  assert.equal(dueLabel(day(5), now).tone, 'urgent');
  assert.equal(dueLabel(day(12), now).tone, 'soon');
  assert.equal(dueLabel(day(30), now).tone, 'later');
  assert.equal(dueLabel(day(-2), now).text, 'Closed');
  assert.equal(dueLabel(null, now).text, '—');
  assert.equal(dueLabel('not a date', now).tone, 'none');
});

test('isDueSoon covers today to 14 days, not closed or missing', () => {
  assert.equal(isDueSoon(day(0), now), true);
  assert.equal(isDueSoon(day(14), now), true);
  assert.equal(isDueSoon(day(15), now), false);
  assert.equal(isDueSoon(day(-1), now), false);
  assert.equal(isDueSoon(null, now), false);
});

test('filterQueue by mode and by title or organisation', () => {
  const list = [
    { id: 'a', title: 'Road works', organization: 'PWD Pune', submissionDeadline: day(3) },
    { id: 'b', title: 'Hostel', organization: 'IIT Hyderabad', submissionDeadline: day(40) },
    { id: 'c', title: null, organization: null, submissionDeadline: null },
  ];
  assert.deepEqual(filterQueue(list, 'all', '', now).map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(filterQueue(list, 'dueSoon', '', now).map((t) => t.id), ['a']);
  assert.deepEqual(filterQueue(list, 'all', 'hyderabad', now).map((t) => t.id), ['b']);
  assert.deepEqual(filterQueue(list, 'dueSoon', 'hostel', now).map((t) => t.id), []);
});
