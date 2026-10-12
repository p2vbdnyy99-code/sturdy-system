// Runs via `node --test src/profileFields.test.ts` (Node 22 type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeMissing, PROFILE_FIELDS } from './profileFields.ts';

test('15 fields, each with a label', () => {
  assert.equal(PROFILE_FIELDS.length, 15);
  assert.ok(PROFILE_FIELDS.every((f) => f.label.trim()));
});

test('missing fields are named by their labels, shortened when many', () => {
  assert.equal(describeMissing(['gstin']), 'GSTIN');
  assert.equal(describeMissing(['industry', 'netWorth', 'experience']), 'Industry, Net worth, Past project experience');
  assert.equal(describeMissing(['industry', 'gstin', 'netWorth', 'licenses', 'equipment']), 'Industry, GSTIN and 3 more');
});
