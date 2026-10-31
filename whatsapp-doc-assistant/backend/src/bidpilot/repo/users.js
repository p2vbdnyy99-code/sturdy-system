// Real user registration + email verification.
// -----------------------------------------------------------------------------
// Distinct from repo/companies.js's createUser() (a Milestone 1 test-fixture
// helper with no password/verification — existing tests depend on its exact
// shape, left untouched). This is the actual signup path.

import { eq, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { users } from '../../db/schema/index.js';
import { hashPassword, isPasswordAcceptable } from '../auth/passwordHash.js';
import { generateToken, hashToken } from '../auth/tokens.js';

export class RegistrationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RegistrationError';
    this.code = code; // 'weak_password' | 'email_taken'
  }
}

export function findUserByEmail(db, email) {
  return db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1)
    .then(([u]) => u);
}

export function findUserById(db, id) {
  return db.select().from(users).where(eq(users.id, id)).limit(1).then(([u]) => u);
}

/**
 * Register a new user. Returns { user, rawVerificationToken } — the raw
 * token is handed to the caller to deliver (dev: logged; production: emailed
 * once a provider is deliberately configured — see routes/auth.js).
 */
export async function registerUser(db, { email, password, name }) {
  if (!isPasswordAcceptable(password, email)) {
    throw new RegistrationError(
      `Password must be at least 8 characters and not the same as your email.`,
      'weak_password',
    );
  }
  const existing = await findUserByEmail(db, email);
  if (existing) {
    throw new RegistrationError('An account with this email already exists.', 'email_taken');
  }

  const passwordHash = await hashPassword(password);
  const rawVerificationToken = generateToken();
  const [user] = await db
    .insert(users)
    .values({
      email,
      name: name || null,
      passwordHash,
      status: 'PENDING_VERIFICATION',
      verificationTokenHash: hashToken(rawVerificationToken),
      verificationTokenExpiresAt: new Date(Date.now() + config.bidpilot.verificationTokenTtlMs),
    })
    .returning();

  return { user, rawVerificationToken };
}

/** Verify a user's email via their raw token. Returns the updated user, or
 *  undefined if the token is missing/wrong/expired — deliberately the same
 *  outcome for all three, so an attacker can't distinguish "wrong token" from
 *  "expired token" from "no such user". */
export async function verifyEmail(db, rawToken) {
  if (!rawToken) return undefined;
  const tokenHash = hashToken(rawToken);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.verificationTokenHash, tokenHash))
    .limit(1);
  if (!user || !user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
    return undefined;
  }

  const [updated] = await db
    .update(users)
    .set({
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}
