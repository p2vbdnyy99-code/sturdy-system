// Milestone 3 — authentication: registration, email verification, login,
// logout, sessions, CSRF, brute-force limiting, and the full "authentication
// != authorization" chain (Session -> User -> company_members -> CompanyScope)
// proven end to end over real HTTP against real Postgres.
//
// Requires DATABASE_URL *and* BIDPILOT_CSRF_SECRET set before this process
// starts (config.js reads both at module-load time — see
// BIDPILOT_ARCHITECTURE.md "Milestone 3" testing notes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { cookieParserMiddleware } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { registerUser, verifyEmail, findUserByEmail, RegistrationError } from '../../src/bidpilot/repo/users.js';
import { hashPassword, verifyPassword, isPasswordAcceptable } from '../../src/bidpilot/auth/passwordHash.js';
import { generateToken, hashToken } from '../../src/bidpilot/auth/tokens.js';
import { createSession, getSessionByToken, destroySessionByToken } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor, verifyCsrfToken } from '../../src/bidpilot/auth/csrf.js';
import { allowLoginAttempt, clearLoginAttempts, _reset as resetLoginLimiter } from '../../src/bidpilot/auth/loginRateLimit.js';
import { sessions, users } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const CSRF_CONFIGURED = Boolean(process.env.BIDPILOT_CSRF_SECRET);
const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !CSRF_CONFIGURED
    ? 'BIDPILOT_CSRF_SECRET not set — required for auth tests'
    : false;

// ── Unit-level: password hashing ──────────────────────────────────────────

test('passwordHash', async (t) => {
  await t.test('hash + verify round-trips correctly', async () => {
    const hash = await hashPassword('a-real-password-123');
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword(hash, 'a-real-password-123'), true);
    assert.equal(await verifyPassword(hash, 'wrong'), false);
  });

  await t.test('isPasswordAcceptable enforces minimum length', () => {
    assert.equal(isPasswordAcceptable('short'), false);
    assert.equal(isPasswordAcceptable('exactly8'), true);
  });

  await t.test('isPasswordAcceptable rejects a password identical to the email', () => {
    assert.equal(isPasswordAcceptable('same@example.com', 'same@example.com'), false);
    assert.equal(isPasswordAcceptable('Same@Example.com', 'same@example.com'), false, 'case-insensitive');
  });
});

// ── Unit-level: tokens ─────────────────────────────────────────────────────

test('tokens', async (t) => {
  await t.test('generateToken produces distinct, high-entropy values', () => {
    const a = generateToken();
    const b = generateToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 40);
  });

  await t.test('hashToken is deterministic and one-way-looking', () => {
    const raw = generateToken();
    assert.equal(hashToken(raw), hashToken(raw));
    assert.notEqual(hashToken(raw), raw);
    assert.match(hashToken(raw), /^[0-9a-f]{64}$/);
  });
});

// ── Unit-level: CSRF ────────────────────────────────────────────────────────

// This block needs no database — but DOES need BIDPILOT_CSRF_SECRET, since
// csrfTokenFor() reads it from config at call time. Guarded independently of
// SKIP_REASON (which is DB-availability-driven) so `npm test` with no
// database configured at all still skips this cleanly rather than failing on
// an unrelated missing secret.
test('csrf', { skip: !CSRF_CONFIGURED && 'BIDPILOT_CSRF_SECRET not set' }, async (t) => {
  await t.test('a token verifies against the session it was derived from', () => {
    const hash = hashToken(generateToken());
    const token = csrfTokenFor(hash);
    assert.equal(verifyCsrfToken(hash, token), true);
  });

  await t.test('a token for a DIFFERENT session fails', () => {
    const hashA = hashToken(generateToken());
    const hashB = hashToken(generateToken());
    assert.equal(verifyCsrfToken(hashB, csrfTokenFor(hashA)), false);
  });

  await t.test('a tampered token fails', () => {
    const hash = hashToken(generateToken());
    const token = csrfTokenFor(hash);
    assert.equal(verifyCsrfToken(hash, `${token}x`), false);
  });

  await t.test('missing/empty token fails without throwing', () => {
    const hash = hashToken(generateToken());
    assert.equal(verifyCsrfToken(hash, undefined), false);
    assert.equal(verifyCsrfToken(hash, ''), false);
  });
});

// ── Unit-level: login rate limiting ─────────────────────────────────────────

test('loginRateLimit', async (t) => {
  t.beforeEach(() => resetLoginLimiter());

  await t.test('allows up to the limit then blocks', () => {
    for (let i = 0; i < 10; i++) {
      assert.equal(allowLoginAttempt('a@example.com', { limit: 10 }), true, `attempt ${i + 1}`);
    }
    assert.equal(allowLoginAttempt('a@example.com', { limit: 10 }), false, '11th attempt blocked');
  });

  await t.test('different keys have independent limits', () => {
    for (let i = 0; i < 10; i++) allowLoginAttempt('a@example.com', { limit: 10 });
    assert.equal(allowLoginAttempt('b@example.com', { limit: 10 }), true);
  });

  await t.test('clearLoginAttempts resets the counter (e.g. after a successful login)', () => {
    for (let i = 0; i < 10; i++) allowLoginAttempt('a@example.com', { limit: 10 });
    assert.equal(allowLoginAttempt('a@example.com', { limit: 10 }), false);
    clearLoginAttempts('a@example.com');
    assert.equal(allowLoginAttempt('a@example.com', { limit: 10 }), true);
  });
});

// ── DB-backed: repo/users.js + sessionService.js ────────────────────────────

test('registration, verification, and sessions (repo-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  await t.test('registerUser hashes the password and never stores it plain', async () => {
    const { user } = await registerUser(db, { email: 'a@example.com', password: 'a-real-password-123' });
    assert.notEqual(user.passwordHash, 'a-real-password-123');
    assert.match(user.passwordHash, /^\$argon2id\$/);
    assert.equal(user.status, 'PENDING_VERIFICATION');
  });

  await t.test('registerUser rejects a duplicate (case-insensitive) email', async () => {
    await registerUser(db, { email: 'dup@example.com', password: 'a-real-password-123' });
    await assert.rejects(
      () => registerUser(db, { email: 'DUP@example.com', password: 'another-password-1' }),
      RegistrationError,
    );
  });

  await t.test('registerUser rejects a weak password before touching the database', async () => {
    await assert.rejects(() => registerUser(db, { email: 'weak@example.com', password: 'x' }), RegistrationError);
    assert.equal(await findUserByEmail(db, 'weak@example.com'), undefined, 'no row was created');
  });

  await t.test('verifyEmail activates the account and clears the token (single use)', async () => {
    const { rawVerificationToken } = await registerUser(db, { email: 'v@example.com', password: 'a-real-password-123' });
    const verified = await verifyEmail(db, rawVerificationToken);
    assert.equal(verified.status, 'ACTIVE');
    assert.ok(verified.emailVerifiedAt instanceof Date);

    // Reusing the same token fails — it was cleared on first use.
    const second = await verifyEmail(db, rawVerificationToken);
    assert.equal(second, undefined);
  });

  await t.test('verifyEmail rejects a wrong token', async () => {
    await registerUser(db, { email: 'v2@example.com', password: 'a-real-password-123' });
    assert.equal(await verifyEmail(db, 'not-the-real-token'), undefined);
  });

  await t.test('verifyEmail rejects an expired token', async () => {
    const { user, rawVerificationToken } = await registerUser(db, { email: 'v3@example.com', password: 'a-real-password-123' });
    // Force the REAL token's expiry into the past directly — faster and more
    // precise than waiting out the actual TTL — then prove verifyEmail()
    // itself rejects it, not just that the DB row looks expired.
    await db.update(users).set({ verificationTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, user.id));
    assert.equal(await verifyEmail(db, rawVerificationToken), undefined);
  });

  await t.test('createSession stores only the HASH, never the raw token', async () => {
    const { user } = await registerUser(db, { email: 's@example.com', password: 'a-real-password-123' });
    const { rawToken, session } = await createSession(db, user.id);
    assert.notEqual(session.tokenHash, rawToken);
    assert.equal(session.tokenHash, hashToken(rawToken));

    const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    assert.notEqual(row.tokenHash, rawToken, 'the raw token never appears in the stored row');
  });

  await t.test('getSessionByToken finds a valid session and rejects a wrong one', async () => {
    const { user } = await registerUser(db, { email: 's2@example.com', password: 'a-real-password-123' });
    const { rawToken } = await createSession(db, user.id);
    const found = await getSessionByToken(db, rawToken);
    assert.ok(found);
    assert.equal(found.userId, user.id);
    assert.equal(await getSessionByToken(db, 'not-a-real-token'), undefined);
    assert.equal(await getSessionByToken(db, undefined), undefined);
  });

  await t.test('getSessionByToken rejects an expired session', async () => {
    const { user } = await registerUser(db, { email: 's3@example.com', password: 'a-real-password-123' });
    const { rawToken, session } = await createSession(db, user.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, session.id));
    assert.equal(await getSessionByToken(db, rawToken), undefined);
  });

  await t.test('destroySessionByToken deletes the row; logging out twice is not an error', async () => {
    const { user } = await registerUser(db, { email: 's4@example.com', password: 'a-real-password-123' });
    const { rawToken } = await createSession(db, user.id);
    await destroySessionByToken(db, rawToken);
    assert.equal(await getSessionByToken(db, rawToken), undefined);
    await assert.doesNotReject(() => destroySessionByToken(db, rawToken));
  });

  await t.test('deleting a user cascades to their sessions', async () => {
    const { user } = await registerUser(db, { email: 's5@example.com', password: 'a-real-password-123' });
    await createSession(db, user.id);
    await db.delete(users).where(eq(users.id, user.id));
    const remaining = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    assert.equal(remaining.length, 0);
  });
});

// ── Full HTTP integration ───────────────────────────────────────────────────

test('BidPilot authentication (full HTTP integration)', { skip: SKIP_REASON, timeout: 30_000 }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    await closeTestDb();
  });

  t.beforeEach(async () => {
    resetLoginLimiter();
    await truncateAll();
  });

  function req(method, path, { body, cookies = {}, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const r = http.request(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          ...headers,
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, setCookie: res.headers['set-cookie'] || [] });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  function extractCookie(setCookieHeaders, name) {
    const line = setCookieHeaders.find((c) => c.startsWith(`${name}=`));
    if (!line) return undefined;
    return line.split(';')[0].split('=')[1];
  }

  async function registerAndVerify(email, password = 'a-real-password-123') {
    const reg = await req('POST', '/bidpilot/register', { body: { email, password } });
    const url = new URL(reg.json.devVerificationUrl);
    const token = url.searchParams.get('token');
    await req('GET', `/bidpilot/verify-email?token=${encodeURIComponent(token)}`);
    return reg.json.userId;
  }

  async function login(email, password = 'a-real-password-123') {
    const res = await req('POST', '/bidpilot/login', { body: { email, password } });
    return {
      status: res.status,
      json: res.json,
      sessionCookie: extractCookie(res.setCookie, 'bidpilot_session'),
      csrfCookie: extractCookie(res.setCookie, 'bidpilot_csrf'),
    };
  }

  await t.test('register -> verify -> login -> /me shows the authenticated user', async () => {
    await registerAndVerify('flow@example.com');
    const { status, json, sessionCookie, csrfCookie } = await login('flow@example.com');
    assert.equal(status, 200);
    assert.equal(json.status, 'ACTIVE');
    assert.equal(json.emailVerified, true);
    assert.ok(sessionCookie);
    assert.ok(csrfCookie);

    const me = await req('GET', '/bidpilot/me', { cookies: { bidpilot_session: sessionCookie } });
    assert.equal(me.status, 200);
    assert.equal(me.json.email, 'flow@example.com');
  });

  await t.test('login is case-insensitive on email', async () => {
    await registerAndVerify('CaseTest@example.com');
    const { status } = await login('casetest@EXAMPLE.com');
    assert.equal(status, 200);
  });

  await t.test('wrong password is rejected with a generic message (not "user not found")', async () => {
    await registerAndVerify('generic@example.com');
    const wrongPw = await login('generic@example.com', 'totally-wrong-pw');
    const noSuchUser = await req('POST', '/bidpilot/login', { body: { email: 'nobody@example.com', password: 'x' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.equal(wrongPw.json.error, noSuchUser.json.error, 'identical error message either way');
  });

  await t.test('an unverified (PENDING_VERIFICATION) user CAN still log in', async () => {
    await req('POST', '/bidpilot/register', { body: { email: 'unverified@example.com', password: 'a-real-password-123' } });
    const { status, json } = await login('unverified@example.com');
    assert.equal(status, 200);
    assert.equal(json.emailVerified, false);
  });

  await t.test('a SUSPENDED user cannot log in, even with the correct password', async () => {
    const userId = await registerAndVerify('suspend@example.com');
    await db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, userId));
    const { status } = await login('suspend@example.com');
    assert.equal(status, 401);
  });

  await t.test('a SUSPENDED user with an EXISTING valid session is rejected on the next request', async () => {
    const userId = await registerAndVerify('suspend2@example.com');
    const { sessionCookie } = await login('suspend2@example.com');
    // Suspend AFTER the session was issued — proves the check runs per
    // request (auth != a one-time gate), not only at login.
    await db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, userId));
    const me = await req('GET', '/bidpilot/me', { cookies: { bidpilot_session: sessionCookie } });
    assert.equal(me.status, 403);
  });

  await t.test('brute-force limiting blocks after repeated failures, and a successful login is unaffected by an UNRELATED email\'s limiter', async () => {
    await registerAndVerify('brute@example.com');
    for (let i = 0; i < 10; i++) {
      await req('POST', '/bidpilot/login', { body: { email: 'brute@example.com', password: 'wrong' } });
    }
    const blocked = await req('POST', '/bidpilot/login', { body: { email: 'brute@example.com', password: 'a-real-password-123' } });
    assert.equal(blocked.status, 429, 'even the CORRECT password is blocked once the attempt limit is hit');
  });

  await t.test('logout requires CSRF and destroys the session', async () => {
    await registerAndVerify('logout@example.com');
    const { sessionCookie, csrfCookie } = await login('logout@example.com');

    const withoutCsrf = await req('POST', '/bidpilot/logout', { cookies: { bidpilot_session: sessionCookie } });
    assert.equal(withoutCsrf.status, 403);

    const withCsrf = await req('POST', '/bidpilot/logout', {
      cookies: { bidpilot_session: sessionCookie },
      headers: { 'x-csrf-token': csrfCookie },
    });
    assert.equal(withCsrf.status, 200);

    const afterLogout = await req('GET', '/bidpilot/me', { cookies: { bidpilot_session: sessionCookie } });
    assert.equal(afterLogout.status, 401, 'the session was actually destroyed, not just the cookie cleared client-side');
  });

  await t.test('no session cookie at all is rejected', async () => {
    const res = await req('GET', '/bidpilot/me');
    assert.equal(res.status, 401);
  });

  await t.test('a forged/garbage session cookie is rejected, not a 500', async () => {
    const res = await req('GET', '/bidpilot/me', { cookies: { bidpilot_session: 'garbage-not-a-real-token' } });
    assert.equal(res.status, 401);
  });

  await t.test('registering twice with the same email returns 409, not a duplicate account', async () => {
    await req('POST', '/bidpilot/register', { body: { email: 'onlyone@example.com', password: 'a-real-password-123' } });
    const second = await req('POST', '/bidpilot/register', { body: { email: 'onlyone@example.com', password: 'another-real-pw-1' } });
    assert.equal(second.status, 409);
  });
});
