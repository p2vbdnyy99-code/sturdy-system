// audit_logs must never carry a secret. recordAuditLog() is the one write
// path (schema.js's docblock says so); this proves it actually refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { recordAuditLog } from '../../src/bidpilot/repo/audit.js';

test('audit log redaction', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  await truncateAll();
  const { user, company } = await createCompanyWithOwner(db, {
    companyName: 'Audit Test Co', userEmail: 'audit@example.com', userName: 'Audit',
  });

  await t.test('a normal audit entry writes cleanly', async () => {
    const row = await recordAuditLog(db, {
      userId: user.id,
      companyId: company.id,
      action: 'tender.created',
      entityType: 'tender',
      metadata: { title: 'Highway Tender' },
    });
    assert.equal(row.action, 'tender.created');
  });

  for (const badKey of ['password', 'token', 'apiKey', 'API_KEY', 'secret', 'Authorization']) {
    await t.test(`refuses metadata containing "${badKey}"`, async () => {
      await assert.rejects(() =>
        recordAuditLog(db, {
          userId: user.id,
          companyId: company.id,
          action: 'user.login',
          entityType: 'user',
          metadata: { [badKey]: 'should-never-be-stored' },
        }),
      );
    });
  }

  await t.test('entityId survives even after the entity it describes is deleted (not a real FK)', async () => {
    const fakeEntityId = '00000000-0000-0000-0000-000000000000';
    const row = await recordAuditLog(db, {
      userId: user.id,
      companyId: company.id,
      action: 'tender.deleted',
      entityType: 'tender',
      entityId: fakeEntityId,
    });
    assert.equal(row.entityId, fakeEntityId, 'no FK constraint blocked this — audit rows outlive their subject');
  });
});
