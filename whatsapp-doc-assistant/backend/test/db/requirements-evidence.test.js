// The "evidence-first" invariant: a tender requirement can never be created
// without at least one evidence entry, and the two are written atomically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './helpers.js';
import { createCompanyWithOwner } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence, MissingEvidenceError } from '../../src/bidpilot/repo/requirements.js';
import { tenderRequirements, tenderRequirementEvidence } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

test('requirement evidence enforcement', { skip: !dbAvailable() && 'DATABASE_URL not set — see test/db/helpers.js' }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  await truncateAll();

  const { user, company } = await createCompanyWithOwner(db, {
    companyName: 'Evidence Test Co',
    userEmail: 'owner@evidence-test.example',
    userName: 'Owner',
  });
  const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
  const tender = await createTender(scope, { title: 'Bridge Rehabilitation Tender' });

  await t.test('rejects an empty evidence array', async () => {
    await assert.rejects(
      () => createRequirementWithEvidence(scope, tender.id, { category: 'FINANCIAL', description: 'x' }, []),
      MissingEvidenceError,
    );
  });

  await t.test('rejects a missing/non-array evidence argument', async () => {
    await assert.rejects(
      () => createRequirementWithEvidence(scope, tender.id, { category: 'FINANCIAL', description: 'x' }, undefined),
      MissingEvidenceError,
    );
  });

  await t.test('a valid call writes the requirement AND its evidence together', async () => {
    const { requirement, evidence } = await createRequirementWithEvidence(
      scope,
      tender.id,
      { category: 'FINANCIAL', description: 'Minimum average annual turnover ₹5 crore', mandatory: true },
      [{ sourcePage: 41, evidenceText: 'Average annual turnover must be at least ₹5 crore over 3 years.' }],
    );
    assert.equal(requirement.category, 'FINANCIAL');
    assert.equal(requirement.companyStatus, 'UNKNOWN', 'never inferred at write time');
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].requirementId, requirement.id);
    assert.equal(evidence[0].sourcePage, 41);

    // And it's really persisted, not just returned in-memory.
    const [persisted] = await db
      .select()
      .from(tenderRequirements)
      .where(eq(tenderRequirements.id, requirement.id));
    assert.ok(persisted);
    const persistedEvidence = await db
      .select()
      .from(tenderRequirementEvidence)
      .where(eq(tenderRequirementEvidence.requirementId, requirement.id));
    assert.equal(persistedEvidence.length, 1);
  });

  await t.test('supports multiple evidence entries for one requirement', async () => {
    const { requirement, evidence } = await createRequirementWithEvidence(
      scope,
      tender.id,
      { category: 'EXPERIENCE', description: 'Similar project experience' },
      [
        { sourcePage: 10, evidenceText: 'At least 2 similar projects in the last 5 years.' },
        { sourcePage: 44, evidenceText: 'Annexure III lists acceptable project categories.' },
      ],
    );
    assert.equal(evidence.length, 2);
    assert.equal(requirement.category, 'EXPERIENCE');
  });
});
