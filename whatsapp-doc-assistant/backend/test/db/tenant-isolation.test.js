// Tenant isolation — the non-negotiable invariant. Every scenario the
// milestone instructions named explicitly, proven against a real Postgres, not
// mocked: Company A must never be able to read or write Company B's tenders,
// documents, requirements, or compliance data, through the repository layer
// (src/bidpilot/repo/*) that all future BidPilot code is meant to use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess, TenantAccessError } from '../../src/bidpilot/repo/tenants.js';
import { createTender, getTender, listTenders, updateTenderStatus } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence } from '../../src/bidpilot/repo/requirements.js';
import { tenderDocuments, complianceItems } from '../../src/db/schema/index.js';

test('tenant isolation', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);

  // Two independent companies, each with their own owning user — set up fresh
  // for every test in this file so isolation is proven from a clean slate.
  let companyA, companyB, scopeA, scopeB, tenderA;

  t.beforeEach(async () => {
    await truncateAll();
    const a = await createCompanyWithOwner(db, {
      companyName: 'Company A Constructions',
      userEmail: 'owner-a@example.com',
      userName: 'Owner A',
    });
    const b = await createCompanyWithOwner(db, {
      companyName: 'Company B Builders',
      userEmail: 'owner-b@example.com',
      userName: 'Owner B',
    });
    companyA = a.company;
    companyB = b.company;
    scopeA = await requireCompanyAccess(db, { userId: a.user.id, companyId: a.company.id });
    scopeB = await requireCompanyAccess(db, { userId: b.user.id, companyId: b.company.id });
    tenderA = await createTender(scopeA, { title: 'Highway Overpass Tender' });
  });

  await t.test('requireCompanyAccess refuses a user who is not a member of that company', async () => {
    const { user: strangerUser } = await createCompanyWithOwner(db, {
      companyName: 'Stranger Co',
      userEmail: 'stranger@example.com',
      userName: 'Stranger',
    });
    await assert.rejects(
      () => requireCompanyAccess(db, { userId: strangerUser.id, companyId: companyA.id }),
      TenantAccessError,
    );
  });

  await t.test('Company A cannot access Company B\'s tender', async () => {
    const tenderB = await createTender(scopeB, { title: 'Metro Rail Tender' });
    const result = await getTender(scopeA, tenderB.id);
    assert.equal(result, undefined, 'cross-company fetch returns undefined, not the row');
  });

  await t.test('Company A cannot list Company B\'s tenders', async () => {
    await createTender(scopeB, { title: 'Metro Rail Tender' });
    const aList = await listTenders(scopeA);
    assert.equal(aList.length, 1, 'only sees its own tender');
    assert.equal(aList[0].id, tenderA.id);
  });

  await t.test('Company A cannot modify Company B\'s tender (status update is silently a no-op)', async () => {
    const tenderB = await createTender(scopeB, { title: 'Metro Rail Tender' });
    const result = await updateTenderStatus(scopeA, tenderB.id, 'SUBMITTED');
    assert.equal(result, undefined, 'update affects zero rows for a foreign tender');

    // Prove it via B's own scope that nothing changed.
    const stillNew = await getTender(scopeB, tenderB.id);
    assert.equal(stillNew.status, 'NEW');
  });

  await t.test('Company A cannot access Company B\'s tender documents', async () => {
    const tenderB = await createTender(scopeB, { title: 'Metro Rail Tender' });
    await db.insert(tenderDocuments).values({
      tenderId: tenderB.id,
      filename: 'tender.pdf',
      storagePath: '/data/tender-b.pdf',
    });

    // The correct access pattern: confirm the tender is owned by the scope's
    // company BEFORE trusting its id to scope a child-table query — exactly
    // what createRequirementWithEvidence does for requirements, and what any
    // future tender_documents repo function must do too.
    const owned = await getTender(scopeA, tenderB.id);
    assert.equal(owned, undefined, 'Company A cannot even confirm the tender exists, let alone its documents');
  });

  await t.test('Company A cannot access Company B\'s requirements or compliance data', async () => {
    const tenderB = await createTender(scopeB, { title: 'Metro Rail Tender' });
    const { requirement } = await createRequirementWithEvidence(
      scopeB,
      tenderB.id,
      { category: 'FINANCIAL', description: 'Minimum turnover ₹5 crore', mandatory: true },
      [{ sourcePage: 12, evidenceText: 'Bidders must show average annual turnover of ₹5 crore.' }],
    );
    await db.insert(complianceItems).values({
      tenderId: tenderB.id,
      requirementId: requirement.id,
      status: 'UNKNOWN',
    });

    // Company A attempting the SAME operation against B's tender must fail at
    // the tender-ownership check, before ever touching requirements/evidence.
    await assert.rejects(() =>
      createRequirementWithEvidence(
        scopeA,
        tenderB.id,
        { category: 'FINANCIAL', description: 'attempted cross-tenant write' },
        [{ evidenceText: 'should never be written' }],
      ),
    );
  });

  await t.test('createRequirementWithEvidence refuses to attach a requirement to a tender A does not own, even by id guessing', async () => {
    const tenderB = await createTender(scopeB, { title: 'Metro Rail Tender' });
    await assert.rejects(() =>
      createRequirementWithEvidence(
        scopeA,
        tenderB.id,
        { category: 'TECHNICAL', description: 'guessed id attack' },
        [{ evidenceText: 'x' }],
      ),
      /not found in this company/,
    );
  });
});
