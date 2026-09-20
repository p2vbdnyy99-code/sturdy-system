// Tenant isolation — the one thing this milestone treats as non-negotiable.
// -----------------------------------------------------------------------------
// The schema puts companyId on every BidPilot-owned resource, but a column
// existing doesn't stop someone from forgetting a WHERE clause. This module is
// the pattern that makes that mistake hard to make: every read/write of a
// tenant-scoped resource goes through a `CompanyScope`, and the scope is the
// only thing that knows how to build a query — there is no code path that
// fetches a tender by id alone.
//
// Usage:
//   const scope = await requireCompanyAccess(db, { userId, companyId });
//   const tender = await scope.getOwned(tenders, tenders.id, tenderId);
//
// If `tenderId` belongs to a DIFFERENT company, getOwned() returns undefined —
// identical to "not found". This is deliberate: a cross-tenant lookup must be
// indistinguishable from a nonexistent record, never a distinguishable
// "403 belongs to someone else" (which would leak that the id is valid).

import { and, eq } from 'drizzle-orm';
import { companyMembers } from '../../db/schema/index.js';

export class TenantAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

/**
 * Verify `userId` is a member of `companyId` and return a CompanyScope bound
 * to that company. Throws TenantAccessError if the membership doesn't exist —
 * callers must not catch this to silently fall back to an unscoped query.
 */
export async function requireCompanyAccess(db, { userId, companyId }) {
  const [membership] = await db
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId)))
    .limit(1);

  if (!membership) {
    throw new TenantAccessError(
      `User ${userId} is not a member of company ${companyId}.`,
    );
  }
  return new CompanyScope(db, companyId, membership.role);
}

/** A capability object: every method takes a table + its companyId column, so
 *  a caller physically cannot express "give me this row regardless of owner" —
 *  the company_id predicate is baked into every method, not opt-in. */
export class CompanyScope {
  constructor(db, companyId, role) {
    this.db = db;
    this.companyId = companyId;
    this.role = role;
  }

  /** All rows of `table` owned by this scope's company. */
  async listOwned(table, companyIdColumn) {
    return this.db.select().from(table).where(eq(companyIdColumn, this.companyId));
  }

  /** One row by id, but ONLY if it belongs to this scope's company — a row
   *  belonging to another company returns undefined, same as a missing id. */
  async getOwned(table, idColumn, companyIdColumn, id) {
    const [row] = await this.db
      .select()
      .from(table)
      .where(and(eq(idColumn, id), eq(companyIdColumn, this.companyId)))
      .limit(1);
    return row;
  }

  /** Insert a row, forcing companyId to this scope — a caller cannot pass a
   *  different companyId in `values` and have it silently accepted, because
   *  this always overwrites it last. */
  async insertOwned(table, companyIdField, values) {
    const [row] = await this.db
      .insert(table)
      .values({ ...values, [companyIdField]: this.companyId })
      .returning();
    return row;
  }

  /** Update a row, but only if it belongs to this scope's company. Returns the
   *  updated row, or undefined if the id doesn't exist / belongs to someone
   *  else (indistinguishable, same reasoning as getOwned). */
  async updateOwned(table, idColumn, companyIdColumn, id, values) {
    const [row] = await this.db
      .update(table)
      .set(values)
      .where(and(eq(idColumn, id), eq(companyIdColumn, this.companyId)))
      .returning();
    return row;
  }
}
