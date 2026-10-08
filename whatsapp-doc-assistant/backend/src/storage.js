// Temporary file storage on local disk.
// -----------------------------------------------------------------------------
// Holds original uploads and generated files under DATA_DIR. Files are swept on
// a TTL so the directory doesn't grow forever. For production, use S3/Supabase
// with signed URLs instead of the local filesystem.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';

const DIR = config.server.dataDir;
const TTL = config.server.sessionTtlMs;

export async function ensureDataDir() {
  await fs.mkdir(DIR, { recursive: true });
}

/** Persist a buffer and return its absolute path. */
export async function saveFile(buffer, extension = 'bin') {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const filePath = path.join(DIR, name);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

// Sweep files older than the session TTL (plus a small grace period).
const sweep = setInterval(
  async () => {
    try {
      const now = Date.now();
      const entries = await fs.readdir(DIR).catch(() => []);
      for (const entry of entries) {
        const full = path.join(DIR, entry);
        const stat = await fs.stat(full).catch(() => null);
        if (stat && now - stat.mtimeMs > TTL + 5 * 60 * 1000) {
          await fs.rm(full, { force: true }).catch(() => {});
        }
      }
    } catch (err) {
      log.debug('storage sweep error:', err.message);
    }
  },
  10 * 60 * 1000,
);
sweep.unref?.();
