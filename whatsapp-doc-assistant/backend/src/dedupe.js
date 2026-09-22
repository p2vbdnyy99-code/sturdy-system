// Webhook de-duplication / replay protection.
// -----------------------------------------------------------------------------
// WhatsApp delivers webhooks at-least-once: Meta retries when an ack is slow, and
// a captured signed request could be replayed. Each inbound message carries a
// unique `id` (wamid...). We remember recently-seen ids for a short window and
// skip anything we've already processed — preventing double AI spend and double
// replies. In-memory only (single instance); back with Redis for multi-instance.

const DEFAULT_TTL_MS = 10 * 60 * 1000; // Meta retries within a few minutes.
const MAX_ENTRIES = 20_000; // hard cap so a flood can't grow memory unbounded.

const seen = new Map(); // id -> expiry timestamp (ms)

/**
 * Record `id` as seen and report whether it was ALREADY seen (a duplicate).
 * Ids that are empty/absent are never treated as duplicates (fail open).
 * @returns {boolean} true if this id was seen before (caller should skip it)
 */
export function isDuplicate(id, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  if (!id || typeof id !== 'string') return false;

  const existing = seen.get(id);
  if (existing !== undefined && existing > now) return true;

  seen.set(id, now + ttlMs);
  if (seen.size > MAX_ENTRIES) prune(now);
  return false;
}

/** Drop expired entries; if still over cap, evict oldest-inserted first. */
function prune(now = Date.now()) {
  for (const [id, expiry] of seen) {
    if (expiry <= now) seen.delete(id);
  }
  if (seen.size > MAX_ENTRIES) {
    const overflow = seen.size - MAX_ENTRIES;
    let i = 0;
    for (const id of seen.keys()) {
      seen.delete(id);
      if (++i >= overflow) break;
    }
  }
}

/** Test helper: clear all remembered ids. */
export function _reset() {
  seen.clear();
}
