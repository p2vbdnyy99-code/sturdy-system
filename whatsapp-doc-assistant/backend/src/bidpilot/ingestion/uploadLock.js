// Serializes concurrent ingestion attempts for the same (company, content
// hash) pair — closes a TOCTOU race that a naive "check for a duplicate, then
// insert" sequence has under truly concurrent requests (as opposed to a
// sequential retry, which the DB-backed dedupe check in documents.js already
// handles correctly on its own, since the first attempt's rows are already
// committed by the time a retry arrives).
//
// This is a NEW, single-purpose implementation, not a reuse of
// src/dedupe.js (that module dedupes WhatsApp webhook message ids on a
// fire-and-forget TTL — a different shape of problem: it's fine to drop an
// old id, but here two callers waiting on the SAME key must resolve to the
// SAME outcome). In-memory, single-instance only — exactly this milestone's
// stated architecture (see BIDPILOT_ARCHITECTURE.md "Queue/scaling decision"
// for when that assumption needs revisiting).

const inFlight = new Map(); // "companyId:hash" -> Promise

/**
 * Run `fn` exclusively for `key` — a second call with the same key while the
 * first is still running WAITS for it and then runs its own `fn` (not a
 * dedup of the call itself, just serialization: this lets the second caller's
 * DB-level duplicate check see the first caller's now-committed rows).
 */
export function withUploadLock(key, fn) {
  const previous = inFlight.get(key) || Promise.resolve();
  const run = previous.then(fn, fn); // run fn regardless of the previous call's outcome
  // Store a promise that never rejects, so a failed upload doesn't poison the
  // lock for the next caller.
  inFlight.set(key, run.catch(() => {}));
  return run;
}
