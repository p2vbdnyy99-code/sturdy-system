// Audit log writer — the one place all audit_logs rows are created, so the
// "never log secrets, tokens, or full document content" rule lives in code,
// not just in a docblock. Every call is checked against a small denylist of
// metadata keys that must never appear; a caller that tries anyway gets a
// thrown error, not a silently-written secret.

import { auditLogs } from '../../db/schema/index.js';

const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'apikey',
  'api_key',
  'secret',
  'authorization',
];

function assertSafeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return;
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.includes(key.toLowerCase())) {
      throw new Error(
        `audit_logs.metadata must not contain a "${key}" field — audit rows are ` +
          'never a place for secrets, tokens, or credentials.',
      );
    }
  }
}

/**
 * Record one audit event.
 * @param {{userId?, companyId?, action, entityType, entityId?, metadata?}} fields
 */
export async function recordAuditLog(db, fields) {
  assertSafeMetadata(fields.metadata);
  const [row] = await db.insert(auditLogs).values(fields).returning();
  return row;
}

export { assertSafeMetadata };
