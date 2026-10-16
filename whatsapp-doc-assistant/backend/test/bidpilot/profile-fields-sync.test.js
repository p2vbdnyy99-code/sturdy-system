// The profile page (frontend/src/profileFields.ts) must ask for exactly the
// fields the server requires (src/bidpilot/profileCompleteness.js), and offer
// "None" for exactly the fields the server accepts it for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REQUIRED_FIELDS, NONE_ALLOWED } from '../../src/bidpilot/profileCompleteness.js';

const src = fs.readFileSync(new URL('../../../frontend/src/profileFields.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('export const PROFILE_FIELDS'), src.indexOf('];', src.indexOf('export const PROFILE_FIELDS')));
const entries = [...block.matchAll(/\{ key: '(\w+)'[^}]*\}/g)].map((m) => ({ key: m[1], none: /noneLabel:/.test(m[0]) }));

test('the profile page asks for every required field, and only those', () => {
  assert.deepEqual(entries.map((e) => e.key).sort(), [...REQUIRED_FIELDS].sort());
});

test('"None" is offered exactly where the server accepts it', () => {
  assert.deepEqual(entries.filter((e) => e.none).map((e) => e.key).sort(), [...NONE_ALLOWED].sort());
});

test('the app and the server agree on how many tenders need no profile', async () => {
  const { FREE_TENDERS_WITHOUT_PROFILE } = await import('../../src/bidpilot/profileGate.js');
  const gate = fs.readFileSync(new URL('../../../frontend/src/shell/profileGate.ts', import.meta.url), 'utf8');
  const m = gate.match(/export const FREE_TENDERS_WITHOUT_PROFILE = (\d+);/);
  assert.ok(m, 'frontend constant found');
  assert.equal(Number(m[1]), FREE_TENDERS_WITHOUT_PROFILE);
});
