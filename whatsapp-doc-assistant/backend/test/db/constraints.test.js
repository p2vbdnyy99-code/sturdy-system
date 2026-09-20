// Constraints, enums, and FK deletion behavior — proven against real Postgres
// so a typo in the schema (wrong onDelete, missing unique index) is caught
// here, not the first time it matters in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './helpers.js';
import { createCompanyWithOwner, upsertCompanyProfile, getCompanyProfile } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender, getTender } from '../../src/bidpilot/repo/tenders.js';
import { users, companies, tenders, tenderPages, telegramUsers } from '../../src/db/schema/index.js';

test('constraints and status handling', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  await truncateAll();

  await t.test('user email uniqueness is case-insensitive', async () => {
    await db.insert(users).values({ email: 'Same@Example.com' });
    await assert.rejects(() => db.insert(users).values({ email: 'same@example.com' }));
  });

  await t.test('company_profiles: only one profile per company (upsert, not duplicate rows)', async () => {
    const { company } = await createCompanyWithOwner(db, {
      companyName: 'Profile Test Co', userEmail: 'p@example.com', userName: 'P',
    });
    await upsertCompanyProfile(db, company.id, { industry: 'Civil construction', yearsInBusiness: 5 });
    await upsertCompanyProfile(db, company.id, { yearsInBusiness: 6 });
    const profile = await getCompanyProfile(db, company.id);
    assert.equal(profile.yearsInBusiness, 6, 'second call updated, did not duplicate');
    assert.equal(profile.industry, 'Civil construction', 'untouched fields survive an upsert');
  });

  await t.test('tender_pages: page_number is unique per tender (no duplicate page rows)', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Pages Test Co', userEmail: 'pages@example.com', userName: 'Pages',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x' });
    await db.insert(tenderPages).values({ tenderId: tender.id, pageNumber: 1, rawText: 'a' });
    await assert.rejects(() =>
      db.insert(tenderPages).values({ tenderId: tender.id, pageNumber: 1, rawText: 'dup' }),
    );
  });

  await t.test('telegram_id is unique across telegram_users', async () => {
    await db.insert(telegramUsers).values({ telegramId: 555555n });
    await assert.rejects(() => db.insert(telegramUsers).values({ telegramId: 555555n }));
  });

  await t.test('tender.status defaults to NEW and only accepts the defined lifecycle values', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Status Test Co', userEmail: 'status@example.com', userName: 'Status',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x' });
    assert.equal(tender.status, 'NEW');
    assert.equal(tender.processingStatus, 'UPLOADED', 'business and processing status both default correctly, independently');

    await assert.rejects(() =>
      db.insert(tenders).values({ companyId: company.id, title: 'bad', status: 'NOT_A_REAL_STATUS' }),
    );
  });

  await t.test('business status and processing status are independent columns', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Independence Test Co', userEmail: 'ind@example.com', userName: 'Ind',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x' });

    await db.update(tenders)
      .set({ status: 'SUBMITTED' })
      .where(eq(tenders.id, tender.id));
    await db.update(tenders)
      .set({ processingStatus: 'EXTRACTING' })
      .where(eq(tenders.id, tender.id));

    const row = await getTender(scope, tender.id);
    assert.equal(row.status, 'SUBMITTED', 'business status: bid already submitted');
    assert.equal(row.processingStatus, 'EXTRACTING', 'e.g. a re-uploaded addendum still processing — neither status lies');
  });

  await t.test('deleting a company with tenders is restricted (no silent data loss)', async () => {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Restrict Test Co', userEmail: 'restrict@example.com', userName: 'R',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    await createTender(scope, { title: 'x' });

    await assert.rejects(() => db.delete(companies).where(eq(companies.id, company.id)));
  });
});
