// Login brute-force protection — a NEW, narrowly-scoped limiter, not a reuse
// of src/ratelimit.js. That module's window is a hardcoded 60s constant tuned
// for WhatsApp message throughput; brute-force protection needs a longer,
// configurable window (attempts-per-15-minutes, not attempts-per-minute), so
// reusing it directly would mean either changing Papyr-shared code or
// silently getting the wrong window. Same reasoning as uploadLock.js in
// Milestone 2: reuse the CONCEPT (fixed-window in-memory counter), write a
// new implementation sized for this problem.
//
// In-memory, single-instance — same scaling caveat as every other in-memory
// mechanism in this codebase at this stage (see BIDPILOT_ARCHITECTURE.md).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;
const MAX_KEYS = 50_000;

const windows = new Map(); // key -> { count, resetAt }

/** Record a login attempt for `key` (e.g. a lowercased email) and report
 *  whether it's still allowed under the limit. */
export function allowLoginAttempt(key, { limit = MAX_ATTEMPTS, windowMs = WINDOW_MS, now = Date.now() } = {}) {
  if (!key) return true;
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count += 1;
  if (windows.size > MAX_KEYS) prune(now);
  return w.count <= limit;
}

/** Call on a SUCCESSFUL login to clear the counter — a legitimate user who
 *  mistyped their password a few times shouldn't stay throttled after
 *  getting it right. */
export function clearLoginAttempts(key) {
  windows.delete(key);
}

function prune(now = Date.now()) {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

/** Test helper. */
export function _reset() {
  windows.clear();
}
