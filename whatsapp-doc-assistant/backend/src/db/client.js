// BidPilot's Postgres connection — lazy singleton, same shape as
// ai/index.js's getProvider()/setProvider() so tests can inject a throwaway
// pool without touching module-load order.
// -----------------------------------------------------------------------------
// Nothing in Papyr's WhatsApp path imports this file. Constructing a pool here
// does not happen at process start — only the first BidPilot call that needs
// the database creates one, and a deployment that never calls into BidPilot
// code never opens a Postgres connection at all.

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config.js';
import { log } from '../logger.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

let _pool = null;
let _db = null;

/** Lazily construct (once) and return the shared pg.Pool + drizzle instance. */
export function getDb() {
  if (_db) return _db;
  if (!config.db.url) {
    throw new Error(
      'DATABASE_URL is not set. BidPilot database features require it — Papyr ' +
        '(the WhatsApp path) does not and is unaffected.',
    );
  }
  _pool = new Pool({
    connectionString: config.db.url,
    max: config.db.poolMax,
  });
  // Without a listener, an idle connection dropped by the server (DB restart,
  // proxy reset) is an unhandled 'error' event and kills the process — what
  // crashed production on 1 Oct. pg already discards the dead client; the next
  // query gets a fresh one, so logging is all that's needed.
  _pool.on('error', (err) => {
    log.warn(`bidpilot db: idle connection dropped (${err.message}); pool will reconnect`);
  });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Test/tooling seam: inject a specific pool+options rather than config-driven
 *  defaults (e.g. point at the local dev database explicitly). */
export function setDb(pool, options = {}) {
  _pool = pool;
  _db = drizzle(pool, { schema, ...options });
  return _db;
}

/** Close the pool. Tests call this in an after-hook so node --test can exit;
 *  production has no reason to call it (the process owns the pool for its
 *  lifetime). */
export async function closeDb() {
  if (_pool) await _pool.end();
  _pool = null;
  _db = null;
}

export { schema };
