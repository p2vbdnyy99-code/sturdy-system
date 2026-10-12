// "Continue with Google" and phone sign-in with a WhatsApp code
// (auth/google.js, auth/phoneOtp.js, auth/externalSignIn.js, routes/auth.js).
// Google's token endpoint and the WhatsApp API are replaced by stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { config } from '../../src/config.js';
import { cookieParserMiddleware } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { registerUser } from '../../src/bidpilot/repo/users.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { setGoogleFetch, checkState, decodeJwtPayload } from '../../src/bidpilot/auth/google.js';
import {
  normalizePhone, maskPhone, whatsappTemplateRequest, setWhatsappFetch, verifyPhoneCode, phoneSignInEnabled, MAX_ATTEMPTS,
} from '../../src/bidpilot/auth/phoneOtp.js';
import { users, sessions, authIdentities, phoneOtps } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

// ── units ──────────────────────────────────────────────────────────────────

test('Indian mobile numbers are normalised to +91…; anything unclear is refused', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('098765-43210'), '+919876543210');
  assert.equal(normalizePhone('919876543210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  for (const bad of ['12345', '5876543210', '+0123', 'abc', '', null, '98765 4321']) assert.equal(normalizePhone(bad), null, String(bad));
  assert.equal(maskPhone('+919876543210'), '+91 98••• ••210');
});

test('the WhatsApp request is an authentication template with the code in the body and the copy-code button', () => {
  const { url, init } = whatsappTemplateRequest('+919876543210', '123456', {
    token: 'T', phoneNumberId: '555', template: 'tendertez_login_code', language: 'en', apiVersion: 'v21.0',
  });
  assert.equal(url, 'https://graph.facebook.com/v21.0/555/messages');
  assert.equal(init.headers.authorization, 'Bearer T');
  const body = JSON.parse(init.body);
  assert.equal(body.to, '919876543210');
  assert.equal(body.template.name, 'tendertez_login_code');
  assert.deepEqual(body.template.components[0], { type: 'body', parameters: [{ type: 'text', text: '123456' }] });
  assert.deepEqual(body.template.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] });
});

test('Google state check is exact and returns the PKCE verifier', () => {
  assert.equal(checkState('abc.verifier', 'abc'), 'verifier');
  assert.equal(checkState('abc.verifier', 'abd'), null);
  assert.equal(checkState(undefined, 'abc'), null);
  assert.equal(checkState('abc.verifier', undefined), null);
});

// ── HTTP ───────────────────────────────────────────────────────────────────

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

// Sessions need the CSRF secret, as in the other HTTP tests.
const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('sign-in with Google and with a WhatsApp code (HTTP + database)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl;
  const saved = { google: { ...config.bidpilot.google }, wa: { ...config.bidpilot.whatsappOtp }, csrf: config.bidpilot.csrfSecret, env: process.env.NODE_ENV };
  let googleClaims; let sentBodies = [];

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    setGoogleFetch(async (url, init) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      assert.match(init.body, /code_verifier=/);
      return { ok: true, json: async () => ({ id_token: jwt(googleClaims) }) };
    });
    setWhatsappFetch(async (_url, init) => { sentBodies.push(JSON.parse(init.body)); return { ok: true, text: async () => '' }; });
  });
  t.after(async () => {
    Object.assign(config.bidpilot.google, saved.google);
    Object.assign(config.bidpilot.whatsappOtp, saved.wa);
    config.bidpilot.csrfSecret = saved.csrf;
    process.env.NODE_ENV = saved.env;
    setGoogleFetch(null); setWhatsappFetch(null);
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });
  t.beforeEach(async () => {
    await truncateAll();
    Object.assign(config.bidpilot.google, { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'shh' });
    Object.assign(config.bidpilot.whatsappOtp, { token: 'wa-token', phoneNumberId: '555' });
    googleClaims = { iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-123', email: 'Asha@Example.com', email_verified: true, name: 'Asha' };
    sentBodies = [];
  });

  function call(method, path, { body, cookie } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = { ...(cookie ? { cookie } : {}), ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}) };
      const r = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, headers: res.headers });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }
  const cookiesFrom = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');

  async function googleRoundTrip({ tamperState = false } = {}) {
    const start = await call('GET', '/bidpilot/auth/google/start');
    assert.equal(start.status, 302);
    const location = new URL(start.headers.location);
    const state = location.searchParams.get('state');
    const res = await call('GET', `/bidpilot/auth/google/callback?code=c0de&state=${tamperState ? 'x' + state : state}`, { cookie: cookiesFrom(start) });
    return { start, location, res };
  }

  await t.test('providers: both on when configured, both off when not (in production)', async () => {
    assert.deepEqual((await call('GET', '/bidpilot/auth/providers')).json, { google: true, phone: true });
    Object.assign(config.bidpilot.google, { clientId: '', clientSecret: '' });
    Object.assign(config.bidpilot.whatsappOtp, { token: '', phoneNumberId: '' });
    config.bidpilot.csrfSecret = 'prod-secret'; process.env.NODE_ENV = 'production';
    try {
      assert.deepEqual((await call('GET', '/bidpilot/auth/providers')).json, { google: false, phone: false });
      assert.equal((await call('GET', '/bidpilot/auth/google/start')).status, 404);
      assert.equal((await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } })).status, 404);
    } finally { config.bidpilot.csrfSecret = saved.csrf; process.env.NODE_ENV = saved.env; }
  });

  await t.test('Google: start sends the browser to Google with state and PKCE', async () => {
    const start = await call('GET', '/bidpilot/auth/google/start');
    const loc = new URL(start.headers.location);
    assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(loc.searchParams.get('client_id'), 'cid.apps.googleusercontent.com');
    assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(loc.searchParams.get('scope'), 'openid email profile');
    assert.match(loc.searchParams.get('redirect_uri'), /\/bidpilot\/auth\/google\/callback$/);
    assert.match(start.headers['set-cookie'][0], /^bidpilot_oauth=.+; Max-Age=600; Path=\/bidpilot\/auth\/google; .*HttpOnly/);
  });

  await t.test('Google: a new user is created, signed in and lands on the dashboard; a return visit reuses them', async () => {
    const { res } = await googleRoundTrip();
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/dashboard');
    const me = await call('GET', '/bidpilot/me', { cookie: cookiesFrom(res) });
    assert.equal(me.json.email, 'asha@example.com');
    assert.equal(me.json.name, 'Asha');
    assert.equal(me.json.emailVerified, true);
    await googleRoundTrip();
    assert.equal((await db.select().from(users)).length, 1, 'same Google account, same user');
    assert.equal((await db.select().from(authIdentities)).length, 1);
  });

  await t.test('Google: linking to an unverified email/password account removes its password and other sessions', async () => {
    const { user } = await registerUser(db, { email: 'asha@example.com', password: 'Attacker12345', name: null });
    await createSession(db, user.id);
    const { res } = await googleRoundTrip();
    assert.equal(res.headers.location, '/dashboard');
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    assert.equal(after.passwordHash, null, 'the pre-registered password no longer works');
    assert.ok(after.emailVerifiedAt);
    assert.equal(after.name, 'Asha');
    assert.equal((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length, 1, 'only the new Google session remains');
    const login = await call('POST', '/bidpilot/login', { body: { email: 'asha@example.com', password: 'Attacker12345' } });
    assert.equal(login.status, 401);
  });

  for (const [label, change] of [
    ['a tampered state', null],
    ['an unverified Google email', { email_verified: false }],
    ['another app\'s token (audience)', { aud: 'someone-else' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['a wrong issuer', { iss: 'https://evil.example' }],
  ]) {
    await t.test(`Google: ${label} is refused with no session`, async () => {
      if (change) Object.assign(googleClaims, change);
      const { res } = await googleRoundTrip({ tamperState: !change });
      assert.equal(res.headers.location, '/login?signin=google_failed');
      assert.ok(!(res.headers['set-cookie'] || []).some((c) => c.startsWith('bidpilot_session=') && !c.startsWith('bidpilot_session=;')));
      assert.equal((await db.select().from(users)).length, 0);
    });
  }

  await t.test('Google: the user cancelling at Google goes back to login', async () => {
    const start = await call('GET', '/bidpilot/auth/google/start');
    const res = await call('GET', '/bidpilot/auth/google/callback?error=access_denied', { cookie: cookiesFrom(start) });
    assert.equal(res.headers.location, '/login?signin=google_cancelled');
  });

  const lastCode = () => sentBodies.at(-1).template.components[0].parameters[0].text;

  await t.test('phone: a code is sent by WhatsApp, and the right code signs in a new user', async () => {
    const start = await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '98765 43210' } });
    assert.equal(start.status, 200);
    assert.equal(start.json.phone, '+919876543210');
    assert.equal(sentBodies.length, 1);
    assert.match(lastCode(), /^\d{6}$/);
    const [row] = await db.select().from(phoneOtps);
    assert.notEqual(row.codeHash, lastCode(), 'only a hash is stored');
    const verify = await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '+91 98765 43210', code: lastCode(), name: 'Ravi' } });
    assert.equal(verify.status, 200);
    assert.equal(verify.json.created, true);
    const me = await call('GET', '/bidpilot/me', { cookie: cookiesFrom(verify) });
    assert.equal(me.json.phone, '+919876543210');
    assert.equal(me.json.email, null);
    assert.equal(me.json.name, 'Ravi');
  });

  await t.test('phone: a code works once; the same number signs in to the same user later', async () => {
    await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
    const code = lastCode();
    assert.equal((await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '9876543210', code } })).status, 200);
    assert.equal((await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '9876543210', code } })).status, 401, 'single use');
    await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
    const again = await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '9876543210', code: lastCode() } });
    assert.equal(again.json.created, false);
    assert.equal((await db.select().from(users)).length, 1);
  });

  await t.test(`phone: ${MAX_ATTEMPTS} wrong codes lock it, even for the right code`, async () => {
    await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      assert.equal((await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '9876543210', code: wrong } })).status, 401);
    }
    const locked = await call('POST', '/bidpilot/auth/phone/verify', { body: { phone: '9876543210', code: right } });
    assert.equal(locked.status, 429);
    assert.equal(locked.json.code, 'locked');
  });

  await t.test('phone: an expired code is refused', async () => {
    await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
    await assert.rejects(() => verifyPhoneCode(db, '9876543210', lastCode(), new Date(Date.now() + 11 * 60_000)), /wrong or has expired/);
  });

  await t.test('phone: at most 3 codes per number in 15 minutes', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } })).status, 200);
    const fourth = await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
    assert.equal(fourth.status, 429);
    assert.equal(sentBodies.length, 3, 'no fourth WhatsApp message');
    assert.equal((await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9123456789' } })).status, 200, 'other numbers unaffected');
  });

  await t.test('phone: an invalid number is refused before anything is sent', async () => {
    const res = await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '12345' } });
    assert.equal(res.status, 400);
    assert.equal(sentBodies.length, 0);
  });

  await t.test('phone: when WhatsApp refuses, the user gets a clear error, the log has no code, and nothing is left behind', async () => {
    setWhatsappFetch(async () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"Template not approved"}}' }));
    const logged = [];
    const orig = { log: console.log, warn: console.warn };
    console.log = (...a) => logged.push(a.join(' ')); console.warn = (...a) => logged.push(a.join(' '));
    try {
      const res = await call('POST', '/bidpilot/auth/phone/start', { body: { phone: '9876543210' } });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, 'send_failed');
    } finally { Object.assign(console, orig); }
    assert.ok(logged.some((l) => /Template not approved/.test(l) && /\+91 98••• ••210/.test(l)), 'the reason is logged with a masked number');
    assert.ok(!logged.some((l) => /9876543210/.test(l)), 'the full number is not logged');
    assert.equal((await db.select().from(phoneOtps)).length, 0);
    setWhatsappFetch(async (_url, init) => { sentBodies.push(JSON.parse(init.body)); return { ok: true, text: async () => '' }; });
  });

  await t.test('phone: in production without WhatsApp, phone sign-in is off (codes are never just logged)', async () => {
    Object.assign(config.bidpilot.whatsappOtp, { token: '', phoneNumberId: '' });
    config.bidpilot.csrfSecret = 'prod-secret'; process.env.NODE_ENV = 'production';
    try {
      assert.equal(phoneSignInEnabled(), false);
    } finally { config.bidpilot.csrfSecret = saved.csrf; process.env.NODE_ENV = saved.env; }
  });

  await t.test('decodeJwtPayload rejects junk', () => {
    assert.equal(decodeJwtPayload('not-a-jwt'), null);
    assert.equal(decodeJwtPayload('a.!!!.c'), null);
  });
});
