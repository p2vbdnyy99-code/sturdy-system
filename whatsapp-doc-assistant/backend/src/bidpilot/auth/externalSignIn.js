// Finding or creating the user behind a Google or phone sign-in.
// -----------------------------------------------------------------------------
// Google: a returning user is found by Google's stable account id ("sub"),
// never by email alone. A first Google sign-in whose email matches an
// existing account links to it. If that account's email was never verified
// (true of every password account today, since no email is sent), anyone
// could have registered it with someone else's address before the real owner
// arrived ("pre-account hijacking"). So linking removes that account's
// password and signs out its other sessions and API tokens: from then on only
// the verified Google owner gets in.
//
// Phone: the WhatsApp code proves the number, so a verified phone finds or
// creates exactly one user (phone is unique).

import { and, eq, sql } from 'drizzle-orm';
import { users, authIdentities, sessions, apiAccessTokens } from '../../db/schema/index.js';

export class SignInError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SignInError';
    this.code = code; // 'suspended'
  }
}

function assertActive(user) {
  if (user.status === 'SUSPENDED') throw new SignInError('This account is not active.', 'suspended');
  return user;
}

/** @returns {Promise<{ user, created: boolean, linked: boolean }>} */
export async function signInWithGoogleProfile(db, { sub, email, name }) {
  return db.transaction(async (tx) => {
    const [identity] = await tx.select().from(authIdentities)
      .where(and(eq(authIdentities.provider, 'google'), eq(authIdentities.subject, sub))).limit(1);
    if (identity) {
      const [user] = await tx.select().from(users).where(eq(users.id, identity.userId)).limit(1);
      if (identity.email !== email) {
        await tx.update(authIdentities).set({ email }).where(eq(authIdentities.id, identity.id));
      }
      return { user: assertActive(user), created: false, linked: false };
    }

    const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
    if (existing) {
      assertActive(existing);
      const update = { emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), status: 'ACTIVE', updatedAt: new Date() };
      if (!existing.emailVerifiedAt) {
        update.passwordHash = null;
        await tx.delete(sessions).where(eq(sessions.userId, existing.id));
        await tx.delete(apiAccessTokens).where(eq(apiAccessTokens.userId, existing.id));
      }
      if (!existing.name && name) update.name = name;
      const [user] = await tx.update(users).set(update).where(eq(users.id, existing.id)).returning();
      await tx.insert(authIdentities).values({ userId: user.id, provider: 'google', subject: sub, email });
      return { user, created: false, linked: true };
    }

    const [user] = await tx.insert(users)
      .values({ email, name: name || null, status: 'ACTIVE', emailVerifiedAt: new Date() })
      .returning();
    await tx.insert(authIdentities).values({ userId: user.id, provider: 'google', subject: sub, email });
    return { user, created: true, linked: false };
  });
}

/** @returns {Promise<{ user, created: boolean }>} */
export async function signInWithPhone(db, { phone, name }) {
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) {
    assertActive(existing);
    if (!existing.phoneVerifiedAt) {
      await db.update(users).set({ phoneVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
    return { user: existing, created: false };
  }
  const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
  const [user] = await db.insert(users)
    .values({ phone, phoneVerifiedAt: new Date(), name: cleanName, status: 'ACTIVE' })
    .onConflictDoNothing()
    .returning();
  if (user) return { user, created: true };
  // Two verifications for the same new number at once: the other one won.
  const [winner] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return { user: assertActive(winner), created: false };
}
