import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindTag, paramsFromQuery, queryFromParams } from './browse.ts';

test('tender search filters: defaults, round trip through the URL, and odd input', () => {
  const d = queryFromParams(new URLSearchParams(''));
  assert.deepEqual(d, { kind: 'all', status: 'open', sort: 'newest', search: '', state: '', organisation: '', page: 1 });
  assert.equal(paramsFromQuery(d).toString(), '', 'defaults stay out of the URL');

  const q = { kind: 'state' as const, status: 'closing' as const, sort: 'closing' as const, search: 'road', state: 'Maharashtra', organisation: '', page: 3 };
  const url = paramsFromQuery(q).toString();
  assert.equal(url, 'kind=state&state=Maharashtra&q=road&status=closing&sort=closing&page=3');
  assert.deepEqual(queryFromParams(new URLSearchParams(url)), q);

  const odd = queryFromParams(new URLSearchParams('kind=railways&status=won&page=-4&sort=x'));
  assert.deepEqual([odd.kind, odd.status, odd.page, odd.sort], ['all', 'open', 1, 'newest']);
  assert.equal(queryFromParams(new URLSearchParams('page=99999')).page, 1000);
});

test('row tag: the state name for state tenders', () => {
  assert.equal(kindTag({ kind: 'state', state: 'Keralam' }), 'Keralam');
  assert.equal(kindTag({ kind: 'gem', state: null }), 'GeM');
  assert.equal(kindTag({ kind: 'central', state: null }), 'Central govt');
});
