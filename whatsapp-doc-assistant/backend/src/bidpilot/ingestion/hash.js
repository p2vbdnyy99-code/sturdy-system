import crypto from 'node:crypto';

/** Content hash for duplicate detection — identity of the bytes, not the
 *  filename (two uploads of the same PDF under different names are still the
 *  same tender document). */
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
