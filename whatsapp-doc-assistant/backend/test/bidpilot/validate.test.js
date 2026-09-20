import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, sanitizeFilename, ValidationError } from '../../src/bidpilot/ingestion/validate.js';

const PDF_BUFFER = Buffer.from('%PDF-1.4\n%fake but has the right header\n');

test('validateUpload', async (t) => {
  await t.test('accepts a real PDF header', () => {
    const { displayFilename } = validateUpload({ buffer: PDF_BUFFER, mimeType: 'application/pdf', filename: 'tender.pdf' });
    assert.equal(displayFilename, 'tender.pdf');
  });

  await t.test('rejects an empty buffer', () => {
    assert.throws(() => validateUpload({ buffer: Buffer.alloc(0) }), ValidationError);
  });

  await t.test('rejects a file without a PDF magic header, even with a .pdf name', () => {
    assert.throws(
      () => validateUpload({ buffer: Buffer.from('not a pdf'), filename: 'totally-a.pdf' }),
      ValidationError,
    );
  });

  await t.test('rejects a non-PDF declared MIME type', () => {
    assert.throws(
      () => validateUpload({ buffer: PDF_BUFFER, mimeType: 'application/x-msdownload' }),
      ValidationError,
    );
  });

  await t.test('rejects a buffer larger than the configured max', async () => {
    const { config } = await import('../../src/config.js');
    const big = Buffer.alloc(config.bidpilot.maxUploadBytes + 1);
    big.write('%PDF-1.4');
    assert.throws(() => validateUpload({ buffer: big }), ValidationError);
  });
});

// sanitizeFilename tested DIRECTLY (not just through an HTTP client, whose
// own filename handling could mask whether OUR code actually strips path
// segments — see this milestone's manual smoke test, which was inconclusive
// on this point for exactly that reason).
test('sanitizeFilename', async (t) => {
  await t.test('strips forward-slash path segments', () => {
    assert.equal(sanitizeFilename('../../../etc/passwd'), '.._.._.._etc_passwd');
  });

  await t.test('strips backslash path segments (Windows-style traversal)', () => {
    assert.equal(sanitizeFilename('..\\..\\windows\\system32\\config'), '.._.._windows_system32_config');
  });

  await t.test('strips control characters', () => {
    assert.equal(sanitizeFilename('evil\x00name\x1f.pdf'), 'evilname.pdf');
  });

  await t.test('never returns something a filesystem call would treat as a path', () => {
    const result = sanitizeFilename('../../../../etc/shadow');
    assert.ok(!result.includes('/'), 'no forward slash survives');
    assert.ok(!result.includes('\\'), 'no backslash survives');
  });

  await t.test('falls back to a default for empty/missing input', () => {
    assert.equal(sanitizeFilename(''), 'document.pdf');
    assert.equal(sanitizeFilename(undefined), 'document.pdf');
  });

  await t.test('caps length', () => {
    const long = 'a'.repeat(500) + '.pdf';
    const result = sanitizeFilename(long);
    assert.ok(result.length <= 200);
  });

  await t.test('leaves an ordinary filename untouched', () => {
    assert.equal(sanitizeFilename('Highway Overpass Tender.pdf'), 'Highway Overpass Tender.pdf');
  });
});
