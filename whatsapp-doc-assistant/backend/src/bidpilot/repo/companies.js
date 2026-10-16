// Setup/onboarding helpers: create a user, a company, and the membership that
// links them. Deliberately minimal — no auth (password hashing, sessions,
// tokens) here; that's a later milestone. This exists so tests (and any future
// signup flow) have one correct way to stand up a tenant, rather than each
// caller hand-rolling three inserts and risking skipping the membership row.

import { eq } from 'drizzle-orm';
import { users, companies, companyMembers, companyProfiles } from '../../db/schema/index.js';

export async function createUser(db, { email, name }) {
  const [row] = await db.insert(users).values({ email, name }).returning();
  return row;
}

export async function createCompany(db, { name }) {
  const [row] = await db.insert(companies).values({ name }).returning();
  return row;
}

export async function addCompanyMember(db, { userId, companyId, role = 'member' }) {
  const [row] = await db
    .insert(companyMembers)
    .values({ userId, companyId, role })
    .returning();
  return row;
}

/** Convenience: create a user + company + owner membership in one call — the
 *  shape almost every test (and eventually a signup endpoint) needs. */
export async function createCompanyWithOwner(db, { companyName, userEmail, userName }) {
  const user = await createUser(db, { email: userEmail, name: userName });
  const company = await createCompany(db, { name: companyName });
  const membership = await addCompanyMember(db, {
    userId: user.id,
    companyId: company.id,
    role: 'owner',
  });
  return { user, company, membership };
}

/**
 * Onboarding: an already-authenticated, already-existing user creates a
 * company and becomes its owner — distinct from createCompanyWithOwner()
 * above, which creates the USER too (that one's for tests/scripts standing
 * up a whole tenant from nothing; this one's for a logged-in person). One
 * transaction: a company row without its owner membership (or vice versa)
 * should never be observable, even transiently.
 * industry/businessType are optional and land on company_profiles (created
 * lazily) rather than companies — per M5's onboarding decision, only
 * name is required; everything else is filled in progressively later.
 */
export async function createCompanyForUser(db, userId, { name, industry, businessType } = {}) {
  return db.transaction(async (tx) => {
    const company = await createCompany(tx, { name });
    const membership = await addCompanyMember(tx, { userId, companyId: company.id, role: 'owner' });
    if (industry || businessType) {
      await upsertCompanyProfile(tx, company.id, {
        ...(industry ? { industry } : {}),
        ...(businessType ? { businessType } : {}),
      });
    }
    return { company, membership };
  });
}

export async function getCompanyProfile(db, companyId) {
  const [row] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.companyId, companyId))
    .limit(1);
  return row;
}

/** Upsert-by-companyId, since there is exactly one profile per company
 *  (unique index on company_id) and callers shouldn't need to know whether
 *  one exists yet. */
export async function upsertCompanyProfile(db, companyId, fields) {
  const existing = await getCompanyProfile(db, companyId);
  if (existing) {
    const [row] = await db
      .update(companyProfiles)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(companyProfiles.companyId, companyId))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(companyProfiles)
    .values({ companyId, ...fields })
    .returning();
  return row;
}
