// Runs via `node --test src/sampleExcerpt.test.ts` (Node 22 type stripping).
// The excerpts shown on the home page and in the guides must be the stored
// sample analysis, word for word and page for page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SAMPLE_EXCERPT } from './sampleExcerpt.ts';

const SAMPLE = JSON.parse(fs.readFileSync(
  new URL('../../backend/src/sample/aiims-bbsr-pump-motors.json', import.meta.url), 'utf8'));
const A = SAMPLE.aggregated;

test('page count and organisation are the sample’s own', () => {
  assert.equal(SAMPLE_EXCERPT.pageCount, SAMPLE.pageCount);
  assert.equal(SAMPLE_EXCERPT.organisation, A.overview.organization.value);
});

test('every key fact is the stored overview value, with its page', () => {
  for (const [key, line] of Object.entries(SAMPLE_EXCERPT.facts)) {
    const stored = A.overview[key];
    assert.ok(stored, `overview has ${key}`);
    assert.equal(line.text, stored.value, key);
    assert.equal(line.page, stored.sourcePage, `${key} page`);
  }
});

test('the bid closed on the stored submission deadline', () => {
  assert.equal(A.overview.submissionDeadline.value.slice(0, 10), '30/05/2026');
  assert.equal(SAMPLE_EXCERPT.closedOn, '30 May 2026');
});

test('every point to check is a stored red flag, word for word, with its page', () => {
  for (const [key, line] of Object.entries(SAMPLE_EXCERPT.points)) {
    const hit = A.redFlags.find((f: { description: string }) => f.description === line.text);
    assert.ok(hit, `${key} is a stored red flag`);
    assert.equal(line.page, hit.sourcePage, `${key} page`);
  }
});

test('every requirement is a stored requirement: title, description and page', () => {
  for (const [key, r] of Object.entries(SAMPLE_EXCERPT.requirements)) {
    const hit = A.requirements.find((s: { title: string }) => s.title === r.title);
    assert.ok(hit, `${key} is a stored requirement`);
    assert.equal(r.description, hit.description, `${key} description`);
    assert.equal(r.page, hit.sourcePage, `${key} page`);
  }
});

test('counts match the stored analysis', () => {
  assert.equal(SAMPLE_EXCERPT.pointsCount, A.redFlags.length);
  // One checklist line per requirement (the sample has no duplicates).
  assert.equal(SAMPLE_EXCERPT.checklistCount, A.requirements.length);
});
