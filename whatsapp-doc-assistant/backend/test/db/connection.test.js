// Sanity checks: the migration applied, the schema is queryable, and the
// pgcrypto-backed uuid default actually works. If these fail, every other
// test/db/*.test.js failure is noise — fix this first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './helpers.js';
import { companies } from '../../src/db/schema/index.js';

test('DB foundation: connection + schema', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  await truncateAll();

  await t.test('the migration created all 18 BidPilot tables', async () => {
    const rows = await db.execute(`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `);
    const names = rows.rows.map((r) => r.table_name).sort();
    assert.equal(names.length, 18, `expected 18 tables, found: ${names.join(', ')}`);
    for (const expected of [
      'users', 'companies', 'company_members', 'company_profiles',
      'tenders', 'tender_pages', 'tender_documents', 'tender_requirements',
      'tender_requirement_evidence', 'tender_boq_items', 'compliance_items',
      'tender_questions', 'tender_events', 'subscriptions', 'usage_records',
      'telegram_users', 'notifications', 'audit_logs',
    ]) {
      assert.ok(names.includes(expected), `missing table: ${expected}`);
    }
  });

  await t.test('gen_random_uuid() default actually fires on insert', async () => {
    const [row] = await db.insert(companies).values({ name: 'Acme Constructions' }).returning();
    assert.match(row.id, /^[0-9a-f-]{36}$/, 'id looks like a uuid');
    assert.equal(row.name, 'Acme Constructions');
    assert.ok(row.createdAt instanceof Date);
  });
});
