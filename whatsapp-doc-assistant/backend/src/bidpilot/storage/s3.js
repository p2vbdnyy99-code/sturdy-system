// S3-compatible storage backend — the production path (see storage/index.js
// header for the full rationale). Works against AWS S3 or any S3-compatible
// provider (Cloudflare R2, Backblaze B2, Supabase Storage, ...) by pointing
// `endpoint` at that provider; nothing here is AWS-specific beyond the SDK.
//
// NOTE on this milestone's testing: this backend's wire-level behavior is
// verified via a mocked S3Client (test/bidpilot/storage-s3.test.js checks the
// exact commands/params sent), not a live bucket — this sandbox has no real
// cloud credentials, and fabricating a "live" test would be dishonest. Smoke
// test against a real bucket before first production use (see
// BIDPILOT_ARCHITECTURE.md, "unresolved decisions").

import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Storage {
  constructor({ bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle }, client) {
    if (!bucket) throw new Error('S3Storage requires a bucket (BIDPILOT_S3_BUCKET).');
    this.bucket = bucket;
    // `client` param: test seam to inject a mocked S3Client without touching
    // real credentials/network.
    this.client = client || new S3Client({
      region: region || 'auto',
      endpoint: endpoint || undefined,
      // Most S3-compatible providers (R2, MinIO, ...) require path-style
      // addressing; real AWS S3 does not need it but tolerates it.
      forcePathStyle: forcePathStyle ?? Boolean(endpoint),
      credentials: accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    });
  }

  newKey(extension = 'pdf') {
    // A date prefix keeps bucket listings sortable/browsable without ever
    // deriving the key from user input.
    const date = new Date().toISOString().slice(0, 10);
    return `tenders/${date}/${crypto.randomUUID()}.${extension}`;
  }

  async putObject({ key, buffer, contentType = 'application/pdf' }) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Private by default — no ACL is set to public; bucket policy should
      // also deny public access at the provider level (documented, not
      // enforceable from application code).
    }));
  }

  async getSignedDownloadUrl({ key, expiresInSeconds = 300 }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject({ key }) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
