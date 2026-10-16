// The app's stage names (frontend/src/tenderDetail/stages.ts) and the
// server's (repo/tenders.js STAGE_LABELS, used in activity events) must
// match, and cover every tenders.status value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGE_LABELS } from '../../src/bidpilot/repo/tenders.js';
import { tenderStatus } from '../../src/db/schema/enums.js';

test('stage labels match between app and server, for every stage', () => {
  const src = fs.readFileSync(new URL('../../../frontend/src/tenderDetail/stages.ts', import.meta.url), 'utf8');
  const app = Object.fromEntries([...src.matchAll(/\{ value: '(\w+)', label: '([^']+)' \}/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(app, STAGE_LABELS);
  assert.deepEqual(Object.keys(STAGE_LABELS).sort(), [...tenderStatus.enumValues].sort());
});
