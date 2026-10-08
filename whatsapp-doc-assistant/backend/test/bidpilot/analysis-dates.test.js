// Indian tender dates are day/month/year in IST. The one thing this must
// never do is read 02/05/2026 as 5 February (US order).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTenderDate } from '../../src/bidpilot/analysis/dates.js';

const iso = (text) => parseTenderDate(text)?.toISOString() ?? null;

test('day/month/year is never read month-first; a date alone is midnight UTC', () => {
  assert.equal(iso('02/05/2026'), '2026-05-02T00:00:00.000Z'); // 2 May 2026 (date only)
  assert.equal(iso('05/02/2026'), '2026-02-05T00:00:00.000Z'); // 5 Feb 2026
  assert.equal(iso('21-04-2026'), '2026-04-21T00:00:00.000Z');
  assert.equal(iso('21.04.26'), '2026-04-21T00:00:00.000Z');
});

test('times as tenders write them are read as IST', () => {
  assert.equal(iso('02/05/2026 @1500hrs'), '2026-05-02T09:30:00.000Z');
  assert.equal(iso('02/05/2026 15:00'), '2026-05-02T09:30:00.000Z');
  assert.equal(iso('02/05/2026 at 3:00 PM'), '2026-05-02T09:30:00.000Z');
  assert.equal(iso('02/05/2026 11.30 AM'), '2026-05-02T06:00:00.000Z');
  assert.equal(iso('02/05/2026 12:00 AM'), '2026-05-01T18:30:00.000Z'); // explicit midnight IST
});

test('month names and ISO dates', () => {
  assert.equal(iso('2 May 2026'), '2026-05-02T00:00:00.000Z');
  assert.equal(iso('02nd May, 2026 15:00'), '2026-05-02T09:30:00.000Z');
  assert.equal(iso('May 2, 2026'), '2026-05-02T00:00:00.000Z');
  assert.equal(iso('2026-05-02'), '2026-05-02T00:00:00.000Z');
  assert.equal(iso('2026-05-02T15:00:00+05:30'), '2026-05-02T09:30:00.000Z');
});

test('with two dates, the first one is used, and the second never becomes a time', () => {
  assert.equal(iso('02/05/2026; 05/05/2026'), '2026-05-02T00:00:00.000Z');
  assert.equal(iso('02/05/2026 (2nd call)'), '2026-05-02T00:00:00.000Z');
  assert.equal(iso('02/05/2026 till 3 PM'), '2026-05-02T09:30:00.000Z');
  assert.equal(iso('04/05/2026 @1530hrs (Technical Bids); 05/05/2026 @1530hrs (Financial Bids)'), '2026-05-04T10:00:00.000Z');
});

test('anything that is not clearly a date gives null, never a guess', () => {
  for (const text of ['within 7 days of award', 'by 10th day of every month', 'as per CPPP', '31/02/2026', '13/13/2026', '', null, undefined]) {
    assert.equal(parseTenderDate(text), null, String(text));
  }
});
