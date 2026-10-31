// Runs via `node --test src/api/visits.test.ts` (Node 22 type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignTag } from './visits.ts';

test('a standard link is counted as source.campaign', () => {
  assert.equal(campaignTag('?utm_source=linkedin&utm_medium=organic&utm_campaign=emd_exemption'), 'linkedin.emd_exemption');
});

test('source alone, and older links that already joined them, are kept as they are', () => {
  assert.equal(campaignTag('?utm_source=x'), 'x');
  assert.equal(campaignTag('?utm_source=email.consultants_oct26&utm_campaign=consultants_oct26'), 'email.consultants_oct26');
});

test('no source means no campaign tag', () => {
  assert.equal(campaignTag('?utm_campaign=orphan'), '');
  assert.equal(campaignTag(''), '');
});
