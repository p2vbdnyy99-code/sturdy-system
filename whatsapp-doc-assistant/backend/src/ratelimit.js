// Per-sender rate limiting (abuse / cost protection).
// -----------------------------------------------------------------------------
// Even though only signature-verified Meta traffic reaches the webhook, a single
// sender can still flood messages and run up AI cost. A fixed-window counter per
// WhatsApp id bounds how many messages we process per minute. In-memory only.

import { config } from './config.js';

const WINDOW_MS = 60 * 1000;
const MAX_KEYS = 50_000;

const windows = new Map(); // key -> { count, resetAt }

/**
 * Record a hit for `key` and report whether it is allowed under the limit.
 * @returns {boolean} true if allowed, false if the sender is over the limit
 */
export function allow(key, { limit = config.server.rateLimitPerMin, now = Date.now() } = {}) {
  if (!key) return true; // no identity to limit on — fail open

  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, w);
  }
  w.count += 1;

  if (windows.size > MAX_KEYS) prune(now);
  return w.count <= limit;
}

function prune(now = Date.now()) {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

/** Test helper: clear all counters. */
export function _reset() {
  windows.clear();
}
