// Upload validation. Every uploaded tender is untrusted input.
// -----------------------------------------------------------------------------
// Two things this file deliberately does NOT do:
//   - trust the client-declared MIME type alone (checked, but backed by a
//     magic-byte check — a renamed .exe claiming application/pdf is caught);
//   - use the client filename for anything except a display label. Storage
//     keys are always generated server-side (storage/*.js's newKey()), so a
//     filename like "../../etc/passwd" can influence what's SHOWN to the user,
//     never where a file is written or read from.

import { config } from '../../config.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const PDF_MAGIC = Buffer.from('%PDF-');

export function validateUpload({ buffer, mimeType, filename, declaredSize }) {
  if (!buffer || !buffer.length) {
    throw new ValidationError('The upload was empty.');
  }
  if (buffer.length > config.bidpilot.maxUploadBytes) {
    const mb = (config.bidpilot.maxUploadBytes / (1024 * 1024)).toFixed(0);
    throw new ValidationError(`File is too large. Maximum is ${mb} MB.`);
  }
  if (declaredSize !== undefined && Math.abs(declaredSize - buffer.length) > 0) {
    // multer already guarantees buffer.length is the real size; this guards a
    // future code path that might trust a client-declared Content-Length.
    throw new ValidationError('Declared file size does not match the upload.');
  }
  if (mimeType && mimeType !== 'application/pdf') {
    throw new ValidationError(`Unsupported file type "${mimeType}". Only PDF is accepted.`);
  }
  if (!buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    throw new ValidationError('This file does not look like a valid PDF (missing PDF header).');
  }

  return { displayFilename: sanitizeFilename(filename) };
}

/** Strip anything that could be mistaken for a path or control character.
 *  This is a DISPLAY label only — never used to construct a filesystem path
 *  or storage key (see file header). */
export function sanitizeFilename(name) {
  const base = String(name || 'document.pdf')
    .replace(/[/\\]/g, '_') // no path separators
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '') // no control characters
    .trim();
  const safe = base || 'document.pdf';
  return safe.length > 200 ? `${safe.slice(0, 197)}...` : safe;
}
