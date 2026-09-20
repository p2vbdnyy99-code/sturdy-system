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
