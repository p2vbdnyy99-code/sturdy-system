// The production pool must survive Postgres dropping an idle connection (DB
// restart, proxy reset). Without a pool 'error' listener that is an unhandled
// 'error' event and the process exits — the 1 Oct production crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { dbAvailable } from './helpers.js';
import { getDb, closeDb } from '../../src/db/client.js';

test('getDb() pool survives a dropped idle connection', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  t.after(closeDb);
  const db = getDb();

  const { rows } = await db.execute('select pg_backend_pid() as pid');
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    await admin.query('select pg_terminate_backend($1)', [rows[0].pid]);
  } finally {
    await admin.end();
  }
  // Give the idle client time to receive the termination and emit 'error'.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const after = await db.execute('select 1 as ok');
  assert.equal(after.rows[0].ok, 1, 'the next query gets a fresh connection');
});
