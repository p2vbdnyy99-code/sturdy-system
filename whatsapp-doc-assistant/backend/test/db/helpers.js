// Shared test setup for the BidPilot DB test suite. Requires a real Postgres —
// DATABASE_URL must point at a DISPOSABLE dev/test database (never production;
// these tests insert and roll back real rows). If it's unset, every test file
// that imports this skips with a clear message rather than failing cryptically
// on a connection error.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/db/schema/index.js';

export const DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || '';

export function dbAvailable() {
  return Boolean(DB_URL);
}

let pool;
export function testDb() {
  if (!pool) pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
  return drizzle(pool, { schema });
}

export async function closeTestDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

// Truncate every BidPilot table between tests so each test starts clean
// without needing per-test transactions (simpler to read, and works fine at
// this data volume). CASCADE handles FK ordering for us.
export async function truncateAll() {
  const db = testDb();
  await db.execute(`
    TRUNCATE TABLE
      audit_logs, notifications, telegram_users, usage_records, subscriptions,
      tender_events, tender_questions, compliance_items, tender_boq_items,
      tender_requirement_evidence, tender_requirements, tender_pages,
      tender_documents, tenders, company_profiles, company_members,
      companies, users
    RESTART IDENTITY CASCADE
  `);
}
