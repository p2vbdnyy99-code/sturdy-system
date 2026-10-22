// Security: webhook signature verification (X-Hub-Signature-256).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signaturesMatch } from '../src/whatsapp.js';

const SECRET = 'test-app-secret';
const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
const sigFor = (buf, secret = SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');

test('accepts a correctly signed body', () => {
  assert.equal(signaturesMatch(body, sigFor(body), SECRET), true);
});

test('rejects a tampered body (signature no longer matches)', () => {
  const tampered = Buffer.from(body.toString().replace('[]', '[{"x":1}]'));
  assert.equal(signaturesMatch(tampered, sigFor(body), SECRET), false);
});

test('rejects a signature made with a different secret', () => {
  assert.equal(signaturesMatch(body, sigFor(body, 'wrong-secret'), SECRET), false);
});

test('rejects a missing / malformed signature header', () => {
  assert.equal(signaturesMatch(body, null, SECRET), false);
  assert.equal(signaturesMatch(body, '', SECRET), false);
  assert.equal(signaturesMatch(body, 'deadbeef', SECRET), false); // no sha256= prefix
  assert.equal(signaturesMatch(body, 'sha256=zz', SECRET), false); // not valid hex/len
});

test('rejects when the raw body is missing (does not throw)', () => {
  assert.equal(signaturesMatch(undefined, sigFor(body), SECRET), false);
  assert.equal(signaturesMatch(null, sigFor(body), SECRET), false);
});

test('dev bypass: no app secret configured → accepts (documented dev behavior)', () => {
  assert.equal(signaturesMatch(body, null, ''), true);
  assert.equal(signaturesMatch(body, 'anything', ''), true);
});
