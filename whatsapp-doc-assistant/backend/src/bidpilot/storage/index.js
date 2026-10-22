// BidPilot file storage — the interface, and which backend is active.
// -----------------------------------------------------------------------------
// STORAGE DECISION (full rationale in BIDPILOT_ARCHITECTURE.md "Storage
// decision"): the database stores METADATA AND A REFERENCE KEY, never the PDF
// bytes. Tender documents are commercially sensitive, so access is always
// through a short-lived signed URL, never a public path.
//
// Two backends implement the same small interface:
//   - LocalDiskStorage: local dev/testing only. Zero external dependencies —
//     "signed URL" is an HMAC-signed, time-limited token served by our own
//     Express route (see signedRoute.js). NOT viable for BidPilot's actual
//     Render deployment: Render's standard web service disk is EPHEMERAL and
//     is wiped on every redeploy, which is fatal for documents that must
//     remain retrievable indefinitely (unlike Papyr's transient temp files).
//   - S3Storage: the production backend. Any S3-compatible provider (AWS S3,
//     Cloudflare R2, Backblaze B2, Supabase Storage, ...) — the interface
//     only needs an endpoint + credentials, so switching providers is a
//     config change, not a code change.
//
// Selection is config-driven (config.bidpilot.storageDriver), same pattern as
// ai/index.js's provider selection — application code calls getStorage() and
// never imports a concrete backend directly.

import { config } from '../../config.js';
import { LocalDiskStorage } from './localDisk.js';
import { S3Storage } from './s3.js';

/**
 * The storage contract every backend implements:
 *   putObject({ key, buffer, contentType }) -> Promise<void>
 *   getSignedDownloadUrl({ key, expiresInSeconds }) -> Promise<string>
 *   deleteObject({ key }) -> Promise<void>
 *   newKey(extension) -> string   — generates a fresh, non-guessable object
 *                                   key; callers never construct keys from
 *                                   user input (eliminates path traversal by
 *                                   construction, not validation).
 */

let _storage = null;

export function getStorage() {
  if (_storage) return _storage;
  _storage = createStorage();
  return _storage;
}

export function createStorage(driver = config.bidpilot.storageDriver) {
  switch (driver) {
    case 'local':
      return new LocalDiskStorage(config.bidpilot.localStorage);
    case 's3':
      return new S3Storage(config.bidpilot.s3);
    default:
      throw new Error(
        `Unknown BIDPILOT_STORAGE_DRIVER "${driver}". Supported: local, s3.`,
      );
  }
}

/** Test seam: inject a specific backend instance. */
export function setStorage(storage) {
  _storage = storage;
}
