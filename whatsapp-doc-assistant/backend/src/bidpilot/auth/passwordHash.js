// Password hashing — Argon2id.
// -----------------------------------------------------------------------------
// Verified before choosing this: `argon2` (node-argon2) ships prebuilt native
// binaries for linux-x64/arm64 under BOTH glibc and musl — installs in ~2s
// with no compiler invoked, confirmed in this sandbox (a stand-in for
// Render's build image) before committing to it. No source compilation, no
// build-toolchain risk — the same bar Drizzle was held to over Prisma.
//
// Library defaults (time cost 3, memory 64MB, parallelism 4) match current
// OWASP guidance and are used as-is rather than hand-tuned.
//
// NEVER: plaintext, reversible encryption, SHA-256/bare hashing, or a
// custom scheme — Argon2id (or a fallback equally-maintained slow KDF) only.

import argon2 from 'argon2';

export function hashPassword(plaintext) {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

export function verifyPassword(hash, plaintext) {
  return argon2.verify(hash, plaintext);
}

// NIST 800-63B: prioritize length over forced complexity rules; no mandated
// uppercase/digit/symbol, no forced rotation. A generous minimum, not a
// maximum-strength gate — the hashing cost is what actually protects a weak
// password from offline cracking.
export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordAcceptable(plaintext, email) {
  if (typeof plaintext !== 'string' || plaintext.length < MIN_PASSWORD_LENGTH) return false;
  if (email && plaintext.toLowerCase() === String(email).toLowerCase()) return false;
  return true;
}
