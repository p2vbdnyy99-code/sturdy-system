import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from './safeNext.ts';

test('a path on this site is kept, with its query and hash', () => {
  assert.equal(safeNextPath('?next=/company-profile'), '/company-profile');
  assert.equal(safeNextPath('?next=%2Ftenders%2Fabc%3Ftab%3Dchecklist%23x'), '/tenders/abc?tab=checklist#x');
});

test('anything that could leave the site falls back to the dashboard', () => {
  for (const next of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', 'example.com', '', '/\nfoo']) {
    assert.equal(safeNextPath(`?next=${encodeURIComponent(next)}`), '/dashboard', next);
  }
  assert.equal(safeNextPath(''), '/dashboard');
});
