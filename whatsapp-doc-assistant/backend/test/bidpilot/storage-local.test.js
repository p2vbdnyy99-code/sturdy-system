// LocalDiskStorage — real filesystem, no mocking needed (unlike S3Storage,
// this backend needs no external service to test for real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalDiskStorage } from '../../src/bidpilot/storage/localDisk.js';

async function withStorage(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bidpilot-storage-'));
  const storage = new LocalDiskStorage({
    dir,
    publicBaseUrl: 'http://localhost:9999',
    signingSecret: 'test-signing-secret',
  });
  try {
    await fn(storage, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('LocalDiskStorage', async (t) => {
  await t.test('newKey never depends on user input and is a plain UUID.ext', async () => {
    await withStorage(async (storage) => {
      const key = storage.newKey('pdf');
      assert.match(key, /^[0-9a-f-]{36}\.pdf$/);
    });
  });

  await t.test('put + read round-trips the exact bytes', async () => {
    await withStorage(async (storage) => {
      const key = storage.newKey('pdf');
      const original = Buffer.from('%PDF-1.4 fake content for the round-trip test');
      await storage.putObject({ key, buffer: original });
      const read = await storage.readObject(key);
      assert.ok(read.equals(original));
    });
  });

  await t.test('a signed URL verifies within its window', async () => {
    await withStorage(async (storage) => {
      const key = storage.newKey('pdf');
      await storage.putObject({ key, buffer: Buffer.from('x') });
      const url = await storage.getSignedDownloadUrl({ key, expiresInSeconds: 60 });
      const u = new URL(url);
      assert.ok(storage.verify(key, u.searchParams.get('expires'), u.searchParams.get('sig')));
    });
  });

  await t.test('a tampered signature fails verification', async () => {
    await withStorage(async (storage) => {
      const key = storage.newKey('pdf');
      const url = await storage.getSignedDownloadUrl({ key, expiresInSeconds: 60 });
      const u = new URL(url);
      assert.equal(
        storage.verify(key, u.searchParams.get('expires'), `${u.searchParams.get('sig')}TAMPERED`),
        false,
      );
    });
  });

  await t.test('an expired signature fails verification', async () => {
    await withStorage(async (storage) => {
      const key = storage.newKey('pdf');
      const expiredAt = Date.now() - 1000; // already in the past
      // Sign it ourselves for an already-past expiry (bypassing the normal
      // getSignedDownloadUrl helper, which always signs for the future).
      // eslint-disable-next-line no-underscore-dangle
      const sig = storage._sign(key, expiredAt);
      assert.equal(storage.verify(key, expiredAt, sig), false);
    });
  });

  await t.test('a signature for a DIFFERENT key is rejected (not just any valid-looking sig)', async () => {
    await withStorage(async (storage) => {
      const keyA = storage.newKey('pdf');
      const keyB = storage.newKey('pdf');
      const url = await storage.getSignedDownloadUrl({ key: keyA, expiresInSeconds: 60 });
      const u = new URL(url);
      assert.equal(
        storage.verify(keyB, u.searchParams.get('expires'), u.searchParams.get('sig')),
        false,
      );
    });
  });

  await t.test('deleteObject removes the file', async () => {
    await withStorage(async (storage, dir) => {
      const key = storage.newKey('pdf');
      await storage.putObject({ key, buffer: Buffer.from('x') });
      await storage.deleteObject({ key });
      await assert.rejects(() => fs.readFile(path.join(dir, key)));
    });
  });

  await t.test('constructor requires a signingSecret', () => {
    assert.throws(() => new LocalDiskStorage({ dir: '/tmp/x', publicBaseUrl: 'http://x' }));
  });
});
