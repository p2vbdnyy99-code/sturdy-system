// Milestone "M3 Session Cookie TTL Fix" — regression coverage for the
// double-conversion bug: sessionCookieOptions()/csrfCookieOptions() used to
// divide maxAgeMs by 1000 before handing it to Express's res.cookie(), whose
// own `maxAge` option already expects milliseconds — so a 30-day TTL was
// actually set as ~43 minutes (Express divided by 1000 a second time when
// building the Set-Cookie Max-Age attribute). No DB needed — these are pure
// functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionCookieOptions, csrfCookieOptions, cookiesShouldBeSecure,
} from '../../src/bidpilot/auth/cookies.js';
import { config } from '../../src/config.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

test('sessionCookieOptions / csrfCookieOptions', async (t) => {
  await t.test('the default 30-day TTL produces maxAge=2,592,000,000ms (not divided)', () => {
    assert.equal(THIRTY_DAYS_MS, 2_592_000_000);
    assert.equal(sessionCookieOptions(THIRTY_DAYS_MS).maxAge, 2_592_000_000);
    assert.equal(csrfCookieOptions(THIRTY_DAYS_MS).maxAge, 2_592_000_000);
  });

  await t.test("config.bidpilot.sessionTtlMs (the app's actual runtime TTL) round-trips unchanged", () => {
    // This is the exact value routes/auth.js passes at the real call site —
    // proving the fix from the config layer through to the cookie options,
    // not just against a hand-picked constant.
    assert.equal(sessionCookieOptions(config.bidpilot.sessionTtlMs).maxAge, config.bidpilot.sessionTtlMs);
    assert.equal(csrfCookieOptions(config.bidpilot.sessionTtlMs).maxAge, config.bidpilot.sessionTtlMs);
  });

  await t.test('an arbitrary configured TTL (not the default) also passes through unchanged', () => {
    for (const maxAgeMs of [1000, 60_000, 3_600_000, 7 * 24 * 60 * 60 * 1000, 90 * 24 * 60 * 60 * 1000]) {
      assert.equal(sessionCookieOptions(maxAgeMs).maxAge, maxAgeMs);
      assert.equal(csrfCookieOptions(maxAgeMs).maxAge, maxAgeMs);
    }
  });

  await t.test('the old (buggy) 1000x-shorter value is NOT what gets returned', () => {
    // Guards against a regression back to the double-conversion — this is
    // exactly the wrong value the bug used to produce for the default TTL.
    assert.notEqual(sessionCookieOptions(THIRTY_DAYS_MS).maxAge, 2_592_000);
    assert.notEqual(csrfCookieOptions(THIRTY_DAYS_MS).maxAge, 2_592_000);
  });

  await t.test('session cookie stays HttpOnly; CSRF cookie stays readable by JS — unchanged by the fix', () => {
    assert.equal(sessionCookieOptions(THIRTY_DAYS_MS).httpOnly, true);
    assert.equal(csrfCookieOptions(THIRTY_DAYS_MS).httpOnly, false);
  });

  await t.test('Secure/SameSite/Path are unchanged by the fix', () => {
    const expectedSecure = cookiesShouldBeSecure();
    for (const opts of [sessionCookieOptions(THIRTY_DAYS_MS), csrfCookieOptions(THIRTY_DAYS_MS)]) {
      assert.equal(opts.secure, expectedSecure);
      assert.equal(opts.sameSite, 'lax');
      assert.equal(opts.path, '/');
    }
  });
});
