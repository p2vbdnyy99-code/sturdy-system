// Local-disk storage backend — dev/testing only, see storage/index.js header.
// -----------------------------------------------------------------------------
// "Signed URL" here means an HMAC-signed, time-limited token verified by
// routes/download.js — the same access-control SHAPE as a real S3 presigned
// URL (expires, can't be forged, can't be guessed), implemented without any
// external service so local dev needs zero cloud credentials.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalDiskStorage {
  constructor({ dir, publicBaseUrl, signingSecret }) {
    if (!signingSecret) {
      throw new Error(
        'LocalDiskStorage requires a signingSecret (BIDPILOT_LOCAL_SIGNING_SECRET) ' +
          'to produce unforgeable download URLs.',
      );
    }
    this.dir = dir;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.signingSecret = signingSecret;
  }

  newKey(extension = 'pdf') {
    return `${crypto.randomUUID()}.${extension}`;
  }

  async putObject({ key, buffer }) {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = this._resolve(key);
    await fs.writeFile(filePath, buffer);
  }

  async getSignedDownloadUrl({ key, expiresInSeconds = 300 }) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const token = this._sign(key, expiresAt);
    return `${this.publicBaseUrl}/bidpilot/files/${encodeURIComponent(key)}` +
      `?expires=${expiresAt}&sig=${token}`;
  }

  async deleteObject({ key }) {
    await fs.rm(this._resolve(key), { force: true });
  }

  /** Used by routes/download.js to verify a signed URL's token. */
  verify(key, expiresParam, sigParam) {
    const expiresAt = Number(expiresParam);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    const expected = this._sign(key, expiresAt);
    // Constant-time comparison — this is a security boundary, not just cache-busting.
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sigParam || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async readObject(key) {
    return fs.readFile(this._resolve(key));
  }

  _sign(key, expiresAt) {
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
  }

  /** Keys are always our own crypto.randomUUID() output (see newKey), never
   *  user input — but resolve+verify the result stays inside `dir` anyway as
   *  defense in depth against a future caller that forgets that invariant. */
  _resolve(key) {
    const filePath = path.join(this.dir, key);
    const resolved = path.resolve(filePath);
    const base = path.resolve(this.dir);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new Error('Refusing to resolve a storage key outside the storage directory.');
    }
    return resolved;
  }
}
