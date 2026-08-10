// AI spend guard — a hard ceiling on paid AI calls so a beta can't run up a bill.
// -----------------------------------------------------------------------------
// The only cost that scales with users is the AI provider (summary / Q&A /
// translate / explain / intent-classify). This module puts a firm, in-memory
// cap on how many of those calls happen — globally per day, globally per month,
// and per user per day. When a cap is reached the caller SKIPS the AI request
// entirely, so the bill physically can't exceed the cap even if the provider
// dashboard limit was never set.
//
// The free features (Word / Excel / OCR — no AI) are never affected; they keep
// working when the AI cap is tripped.
//
// State is in memory: counters reset on process restart. For a single-instance
// beta that's fine. For multi-instance, back this with a shared store (Redis)
// so the cap is global rather than per-instance.

import { config } from './config.js';

const state = {
  day: '', // 'YYYY-MM-DD' (UTC) currently counted
  month: '', // 'YYYY-MM' (UTC) currently counted
  dayCount: 0,
  monthCount: 0,
  perUserDay: new Map(), // userId -> calls made today
};

function stamps(now) {
  const iso = now.toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

// Roll the windows forward when the UTC day/month changes, zeroing the counters
// that the new window starts fresh. Called on every check so counts never carry
// across a boundary.
function roll(now) {
  const { day, month } = stamps(now);
  if (day !== state.day) {
    state.day = day;
    state.dayCount = 0;
    state.perUserDay.clear();
  }
  if (month !== state.month) {
    state.month = month;
    state.monthCount = 0;
  }
}

/**
 * Check-and-consume one AI call for `userId`.
 *
 * Returns `{ ok }` — and when `ok` is false, `scope` naming the cap that tripped
 * (`'user' | 'day' | 'month'`) so the caller can tell the user which limit was
 * hit. A cap of 0 (or negative) means "unlimited" — that dimension is disabled.
 *
 * IMPORTANT: this both checks AND consumes. Call it exactly once, immediately
 * before an AI request you intend to make; if it returns ok:false, do NOT make
 * the request.
 */
export function consumeAiCall(userId, budget = config.budget, now = new Date()) {
  roll(now);
  const { dailyAiCalls, monthlyAiCalls, perUserDailyAiCalls } = budget;
  const userUsed = state.perUserDay.get(userId) || 0;

  if (perUserDailyAiCalls > 0 && userUsed >= perUserDailyAiCalls) return { ok: false, scope: 'user' };
  if (dailyAiCalls > 0 && state.dayCount >= dailyAiCalls) return { ok: false, scope: 'day' };
  if (monthlyAiCalls > 0 && state.monthCount >= monthlyAiCalls) return { ok: false, scope: 'month' };

  state.dayCount += 1;
  state.monthCount += 1;
  state.perUserDay.set(userId, userUsed + 1);
  return { ok: true, scope: null };
}

/** Current usage snapshot — for a health endpoint or a periodic metric line. */
export function budgetSnapshot() {
  return {
    day: state.day,
    month: state.month,
    dayCount: state.dayCount,
    monthCount: state.monthCount,
    usersToday: state.perUserDay.size,
  };
}

/** Test seam: wipe all counters so each test starts from zero. */
export function __resetBudget() {
  state.day = '';
  state.month = '';
  state.dayCount = 0;
  state.monthCount = 0;
  state.perUserDay.clear();
}
