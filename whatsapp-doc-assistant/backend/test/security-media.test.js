// Security: media id + media URL validation (SSRF / token-leak / URL-injection).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidMediaId, isAllowedMediaUrl } from '../src/whatsapp.js';

test('accepts normal WhatsApp media ids', () => {
  assert.equal(isValidMediaId('1296837816838281'), true);
  assert.equal(isValidMediaId('abcDEF_123-xyz'), true);
});

test('rejects ids that could alter the Graph API URL path/query', () => {
  assert.equal(isValidMediaId('123/subscribed_apps'), false);
  assert.equal(isValidMediaId('123?fields=x'), false);
  assert.equal(isValidMediaId('../123'), false);
  assert.equal(isValidMediaId('123 456'), false);
  assert.equal(isValidMediaId(''), false);
  assert.equal(isValidMediaId(null), false);
  assert.equal(isValidMediaId('a'.repeat(200)), false); // too long
});

test('allows only https Meta-owned media hosts (token is sent with the fetch)', () => {
  assert.equal(
    isAllowedMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'),
    true,
  );
  assert.equal(isAllowedMediaUrl('https://scontent.xx.fbcdn.net/v/t1/file'), true);
  assert.equal(isAllowedMediaUrl('https://mmg.whatsapp.net/d/f'), true);
});

test('blocks non-Meta hosts and non-https schemes (no token leak / SSRF)', () => {
  assert.equal(isAllowedMediaUrl('https://evil.example.com/steal'), false);
  assert.equal(isAllowedMediaUrl('http://lookaside.fbsbx.com/x'), false); // not https
  assert.equal(isAllowedMediaUrl('https://fbsbx.com.evil.com/x'), false); // suffix spoof
  assert.equal(isAllowedMediaUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedMediaUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedMediaUrl('not a url'), false);
  assert.equal(isAllowedMediaUrl(undefined), false);
});
