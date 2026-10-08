// Shared random-token + hashing helpers for sessions and email verification.
// -----------------------------------------------------------------------------
// The pattern used everywhere a bearer credential is issued: generate a
// high-entropy random token, hand the RAW token to the client (cookie, link),
// store only its hash. A leaked database never yields a usable credential.

import crypto from 'node:crypto';

/** 256 bits of randomness, URL/cookie-safe. */
export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Plain SHA-256 is sufficient here (not HMAC): the input is already a
 *  uniformly random 256-bit value from a CSPRNG, so a precompute/rainbow-table
 *  attack against the hash is infeasible regardless — the entropy lives in the
 *  token, not in a server-side secret. (Contrast with password hashing, where
 *  the input space is small/guessable and a slow, salted KDF like Argon2id is
 *  required — see passwordHash.js.) */
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
