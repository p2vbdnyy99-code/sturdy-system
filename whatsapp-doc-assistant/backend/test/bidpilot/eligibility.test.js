// Milestone 6 — the eligibility-check pipeline and the /eligibility route,
// over real Postgres. The AI provider is ALWAYS mocked (setProvider) — no
// real OpenAI/Anthropic call is ever made in this suite, same discipline as
// analysis.test.js.
//
// This is the CORRECTED M6 design (see BIDPILOT_ARCHITECTURE.md's Milestone
// 6 section): the AI supplies only a profile FIELD NAME and a REASON, never
// a value — the server looks up the real value from the real company
// profile and only persists a verdict backed by a field that actually
// checks out. These tests exercise that verification, not just the shape
// validation the first (rejected) M6 draft relied on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner, upsertCompanyProfile } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { createRequirementWithEvidence, listRequirements } from '../../src/bidpilot/repo/requirements.js';
import { runEligibility, EligibilityError } from '../../src/bidpilot/analysis/eligibilityPipeline.js';
import { validateEligibilityResult } from '../../src/bidpilot/analysis/eligibility.js';
import { AnalysisBudgetError } from '../../src/bidpilot/analysis/budget.js';
import { setProvider } from '../../src/ai/index.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { createApiToken } from '../../src/bidpilot/auth/apiTokenService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createAuthRouter } from '../../src/bidpilot/routes/auth.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { tenderEvents, usageRecords } from '../../src/db/schema/index.js';
import { config } from '../../src/config.js';

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set — see test/db/helpers.js'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required since Milestone 3'
    : false;

function mockEligibilityResult(entries) {
  return JSON.stringify({ results: entries });
}

// ── Unit-level: response SHAPE validation only ──────────────────────────────

test('validateEligibilityResult', () => {
  const ok = validateEligibilityResult({
    results: [{ idx: 0, status: 'MEETS', actionRequired: null, companyEvidence: [{ field: 'annualTurnover', reason: 'covers the minimum' }] }],
  });
  assert.deepEqual(ok.get(0), {
    status: 'MEETS', actionRequired: null, companyEvidence: [{ field: 'annualTurnover', reason: 'covers the minimum' }],
  });

  const badIdx = validateEligibilityResult({ results: [{ idx: 'zero', status: 'MEETS' }] });
  assert.equal(badIdx.size, 0, 'a non-integer idx is dropped entirely, never guessed at');

  const badStatus = validateEligibilityResult({ results: [{ idx: 0, status: 'DEFINITELY_WINS' }] });
  assert.equal(badStatus.get(0).status, 'UNKNOWN', 'an invalid enum value falls back to UNKNOWN, never passed through');

  const noEvidenceArray = validateEligibilityResult({ results: [{ idx: 0, status: 'MEETS', companyEvidence: 'not an array' }] });
  assert.deepEqual(noEvidenceArray.get(0).companyEvidence, []);

  assert.equal(validateEligibilityResult(null).size, 0);
  assert.equal(validateEligibilityResult({}).size, 0);
});

// ── Repo/pipeline-level: runEligibility ─────────────────────────────────────

test('runEligibility (pipeline-level)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  t.after(closeTestDb);
  t.beforeEach(truncateAll);

  async function setupTender() {
    const { user, company } = await createCompanyWithOwner(db, {
      companyName: 'Eligibility Test Co', userEmail: `${Math.random()}@example.com`, userName: 'U',
    });
    const scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    const tender = await createTender(scope, { title: 'x.pdf' });
    return { scope, tender, companyId: company.id };
  }

  async function addRequirement(scope, tenderId, fields = {}) {
    const { requirement } = await createRequirementWithEvidence(
      scope, tenderId,
      { category: 'FINANCIAL', title: 'Turnover', description: 'Min turnover 5cr', mandatory: true, ...fields },
      [{ sourcePage: 1, evidenceText: 'quoted evidence' }],
    );
    return requirement;
  }

  await t.test('a tender with no requirements yet evaluates nothing and spends nothing', async () => {
    const { scope, tender, companyId } = await setupTender();
    const result = await runEligibility(scope, tender.id);
    assert.equal(result.evaluated, 0);
    assert.deepEqual(result.results, []);
    const usage = await db.select().from(usageRecords).where(eq(usageRecords.companyId, companyId));
    assert.equal(usage.length, 0);
  });

  await t.test('no company profile yet: every requirement becomes UNKNOWN, no AI call, no evidence', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    setProvider({ name: 'mock', async complete() { throw new Error('must not be called'); } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyStatus, 'UNKNOWN');
    assert.match(result.results[0].actionRequired, /company profile/i);
    assert.deepEqual(result.results[0].companyEvidence, []);

    const usage = await db.select().from(usageRecords).where(eq(usageRecords.companyId, companyId));
    assert.equal(usage.length, 0, 'no budget consumed when the AI was never called');
  });

  await t.test('MEETS with a real, non-empty field and a reason: verdict stands, evidence is SERVER-derived', async () => {
    const { scope, tender, companyId } = await setupTender();
    const req1 = await addRequirement(scope, tender.id, { description: 'Min turnover 5cr' });
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });

    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{
        idx: 0, status: 'MEETS', actionRequired: null,
        // The AI supplies NO value — only field + reason. If the pipeline
        // trusted an AI-supplied value, this test wouldn't be able to tell;
        // asserting the PERSISTED value below is what proves it's ignored.
        companyEvidence: [{ field: 'annualTurnover', reason: 'Covers the required ₹5 crore minimum.' }],
      }]);
    } });

    const result = await runEligibility(scope, tender.id);
    const entry = result.results.find((r) => r.id === req1.id);
    assert.equal(entry.companyStatus, 'MEETS');
    assert.equal(entry.companyEvidence.length, 1);
    assert.equal(entry.companyEvidence[0].field, 'annualTurnover');
    assert.equal(entry.companyEvidence[0].value, '80000000', 'value is the REAL profile value, server-read');
    assert.equal(entry.companyEvidence[0].label, 'Annual Turnover');
    assert.equal(entry.companyEvidence[0].reason, 'Covers the required ₹5 crore minimum.');

    const usage = await db.select().from(usageRecords).where(eq(usageRecords.companyId, companyId));
    assert.equal(usage.length, 1, 'exactly one AI call recorded, regardless of requirement count');
    const events = await db.select().from(tenderEvents).where(eq(tenderEvents.tenderId, tender.id));
    assert.ok(events.some((e) => e.eventType === 'eligibility_checked'));
  });

  await t.test('the AI CANNOT get its own claimed value accepted — server always substitutes the real one', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });

    setProvider({ name: 'mock', async complete() {
      // Even if a model ignores instructions and includes a "value" key,
      // the pipeline must never read it.
      return JSON.stringify({ results: [{
        idx: 0, status: 'MEETS',
        companyEvidence: [{ field: 'annualTurnover', value: '999999999999', reason: 'fabricated value attempt' }],
      }] });
    } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyEvidence[0].value, '80000000', 'the fabricated "999999999999" was never used');
  });

  await t.test('MEETS/DOES_NOT_APPEAR_TO_MEET with NO companyEvidence is downgraded to UNKNOWN', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() { return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [] }]); } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyStatus, 'UNKNOWN');
    assert.match(result.results[0].actionRequired, /could not be verified/i);
  });

  await t.test('AI cannot fabricate a company-profile field that does not exist — downgraded to UNKNOWN', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'winningChance', reason: 'nice number' }] }]);
    } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyStatus, 'UNKNOWN');
    assert.deepEqual(result.results[0].companyEvidence, []);
  });

  await t.test('a real field that is EMPTY in the actual profile does not back a verdict — downgraded to UNKNOWN', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id, { category: 'CERTIFICATION', description: 'ISO 9001 required' });
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' }); // certifications left empty/default
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'certifications', reason: 'has ISO 9001' }] }]);
    } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyStatus, 'UNKNOWN', 'certifications is real but empty — cannot back a MEETS');
  });

  await t.test('a real, non-empty field cited with NO reason does not back a verdict — downgraded to UNKNOWN', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover' }] }]); // no reason
    } });

    const result = await runEligibility(scope, tender.id);
    assert.equal(result.results[0].companyStatus, 'UNKNOWN', 'a citation with no explanation is not accepted');
  });

  await t.test('a requirement the AI reply omits is left as UNKNOWN, never silently untouched', async () => {
    const { scope, tender, companyId } = await setupTender();
    const req1 = await addRequirement(scope, tender.id);
    await addRequirement(scope, tender.id, { description: 'Second requirement' });
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });

    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });

    const result = await runEligibility(scope, tender.id);
    const other = result.results.find((r) => r.id !== req1.id);
    assert.equal(other.companyStatus, 'UNKNOWN');
    assert.match(other.actionRequired, /try again/i);
  });

  await t.test('ORIGINAL requirement fields and tender evidence are byte-identical before and after an eligibility run', async () => {
    const { scope, tender, companyId } = await setupTender();
    const before = await addRequirement(scope, tender.id, { title: 'Turnover', description: 'Min turnover 5cr', mandatory: true });
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });

    await runEligibility(scope, tender.id);
    const [after] = await listRequirements(scope, tender.id);
    assert.equal(after.category, before.category);
    assert.equal(after.title, before.title);
    assert.equal(after.description, before.description);
    assert.equal(after.mandatory, before.mandatory);
    assert.equal(after.id, before.id);
    // Only these three are expected to have changed:
    assert.notEqual(after.companyStatus, before.companyStatus);
  });

  await t.test('unparseable AI output throws EligibilityError and writes nothing', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() { return 'not json at all'; } });

    await assert.rejects(() => runEligibility(scope, tender.id), EligibilityError);

    const usage = await db.select().from(usageRecords).where(eq(usageRecords.companyId, companyId));
    assert.equal(usage.length, 0, 'a total failure never counts against the company\'s budget');
    const persisted = await listRequirements(scope, tender.id);
    assert.equal(persisted[0].companyStatus, 'UNKNOWN', 'left at its untouched default, not corrupted');
  });

  await t.test('a FAILED run leaves a PREVIOUS successful eligibility result completely untouched', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });

    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });
    await runEligibility(scope, tender.id);
    const [afterSuccess] = await listRequirements(scope, tender.id);
    assert.equal(afterSuccess.companyStatus, 'MEETS');

    setProvider({ name: 'mock2', async complete() { return 'garbage, not json'; } });
    await assert.rejects(() => runEligibility(scope, tender.id), EligibilityError);

    const [afterFailure] = await listRequirements(scope, tender.id);
    assert.equal(afterFailure.companyStatus, 'MEETS', 'the prior successful verdict was never overwritten by the failed attempt');
    assert.deepEqual(afterFailure.companyEvidence, afterSuccess.companyEvidence);
  });

  await t.test('re-running REPLACES the previous evidence — never appends or retains it', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });

    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });
    await runEligibility(scope, tender.id);
    const [run1] = await listRequirements(scope, tender.id);
    assert.equal(run1.companyStatus, 'MEETS');
    assert.equal(run1.companyEvidence.length, 1);

    // Profile changes (turnover drops below the requirement) and the AI's
    // verdict changes accordingly on the second run.
    await upsertCompanyProfile(db, companyId, { annualTurnover: '1000' });
    setProvider({ name: 'mock2', async complete() {
      return mockEligibilityResult([{
        idx: 0, status: 'DOES_NOT_APPEAR_TO_MEET',
        companyEvidence: [{ field: 'annualTurnover', reason: 'now below the required minimum' }],
      }]);
    } });
    await runEligibility(scope, tender.id);
    const [run2] = await listRequirements(scope, tender.id);
    assert.equal(run2.companyStatus, 'DOES_NOT_APPEAR_TO_MEET');
    assert.equal(run2.companyEvidence.length, 1, 'replaced, not appended (would be 2 if accumulated)');
    assert.equal(run2.companyEvidence[0].value, '1000', 'the new, real value — not the stale one from run 1');
  });

  await t.test('exceeding the daily eligibility budget throws AnalysisBudgetError before any AI call', async () => {
    const { scope, tender, companyId } = await setupTender();
    await addRequirement(scope, tender.id);
    await upsertCompanyProfile(db, companyId, { annualTurnover: '80000000' });
    const original = config.bidpilot.eligibility.maxCallsPerCompanyPerDay;
    config.bidpilot.eligibility.maxCallsPerCompanyPerDay = 0;
    try {
      setProvider({ name: 'mock', async complete() { throw new Error('must not be called'); } });
      await assert.rejects(() => runEligibility(scope, tender.id), AnalysisBudgetError);
    } finally {
      config.bidpilot.eligibility.maxCallsPerCompanyPerDay = original;
    }
  });
});

// ── Full HTTP integration ───────────────────────────────────────────────────

test('POST /tenders/:id/eligibility (HTTP integration)', { skip: SKIP_REASON, timeout: 30_000 }, async (t) => {
  const db = testDb();
  let server;
  let baseUrl;

  t.before(async () => {
    const appPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
    setDb(appPool);
    const app = express();
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createAuthRouter());
    app.use('/bidpilot', createTendersRouter());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    await closeTestDb();
  });

  let userA, companyA, userB, companyB, authA;

  async function mintAuth(userId) {
    const { rawToken, session } = await createSession(db, userId);
    return { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
  }

  t.beforeEach(async () => {
    await truncateAll();
    const a = await createCompanyWithOwner(db, { companyName: 'Elig Co A', userEmail: 'a@elig.example', userName: 'A' });
    const b = await createCompanyWithOwner(db, { companyName: 'Elig Co B', userEmail: 'b@elig.example', userName: 'B' });
    userA = a.user; companyA = a.company;
    userB = b.user; companyB = b.company;
    authA = await mintAuth(userA.id);
  });

  function req(method, path, { body, auth, bearer } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...(auth ? { cookie: `${SESSION_COOKIE_NAME}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      };
      const r = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  async function makeTenderWithRequirement(scope) {
    const tender = await createTender(scope, { title: 'x.pdf' });
    await createRequirementWithEvidence(
      scope, tender.id,
      { category: 'FINANCIAL', description: 'Min turnover 5cr', mandatory: true },
      [{ sourcePage: 1, evidenceText: 'q' }],
    );
    return tender;
  }

  await t.test('the golden path: check eligibility, response includes server-verified evidence', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    await upsertCompanyProfile(db, companyA.id, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });

    const res = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 200);
    assert.equal(res.json.requirements[0].companyStatus, 'MEETS');
    assert.equal(res.json.requirements[0].companyEvidence[0].value, '80000000');
  });

  await t.test('works via apiToken bearer too, without any CSRF header', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    setProvider({ name: 'mock', async complete() { return mockEligibilityResult([{ idx: 0, status: 'UNKNOWN' }]); } });

    const { rawToken } = await createApiToken(db, userA.id);
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { bearer: rawToken, body: { companyId: companyA.id } });
    assert.equal(res.status, 200);
  });

  await t.test('Company A (cookie) cannot check eligibility on Company B\'s tender', async () => {
    const scopeB = await requireCompanyAccess(db, { userId: userB.id, companyId: companyB.id });
    const tenderB = await makeTenderWithRequirement(scopeB);
    const res = await req('POST', `/bidpilot/tenders/${tenderB.id}/eligibility`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 404);
  });

  await t.test('tenant isolation over apiToken too: User A\'s apiToken cannot reach Company B\'s tender', async () => {
    const scopeB = await requireCompanyAccess(db, { userId: userB.id, companyId: companyB.id });
    const tenderB = await makeTenderWithRequirement(scopeB);
    const { rawToken } = await createApiToken(db, userA.id);
    const res = await req('POST', `/bidpilot/tenders/${tenderB.id}/eligibility`, { bearer: rawToken, body: { companyId: companyA.id } });
    assert.equal(res.status, 404);
  });

  await t.test('requires CSRF for a cookie-authenticated request, like every other tender mutation route', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    const res = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, {
      body: { companyId: companyA.id },
      auth: { cookie: authA.cookie, csrf: 'wrong-token' },
    });
    assert.equal(res.status, 403);
  });

  await t.test('a company over its daily eligibility budget gets 429', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    await upsertCompanyProfile(db, companyA.id, { annualTurnover: '80000000' });
    const original = config.bidpilot.eligibility.maxCallsPerCompanyPerDay;
    config.bidpilot.eligibility.maxCallsPerCompanyPerDay = 0;
    try {
      const res = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { auth: authA, body: { companyId: companyA.id } });
      assert.equal(res.status, 429);
    } finally {
      config.bidpilot.eligibility.maxCallsPerCompanyPerDay = original;
    }
  });

  await t.test('unparseable AI output surfaces as 502, not a 500 crash', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    await upsertCompanyProfile(db, companyA.id, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() { return 'garbage'; } });

    const res = await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { auth: authA, body: { companyId: companyA.id } });
    assert.equal(res.status, 502);
  });

  await t.test('GET /tenders/:id surfaces companyStatus/actionRequired/companyEvidence after a run (previously missing)', async () => {
    const scope = await requireCompanyAccess(db, { userId: userA.id, companyId: companyA.id });
    const tender = await makeTenderWithRequirement(scope);
    await upsertCompanyProfile(db, companyA.id, { annualTurnover: '80000000' });
    setProvider({ name: 'mock', async complete() {
      return mockEligibilityResult([{ idx: 0, status: 'MEETS', companyEvidence: [{ field: 'annualTurnover', reason: 'covers it' }] }]);
    } });
    await req('POST', `/bidpilot/tenders/${tender.id}/eligibility`, { auth: authA, body: { companyId: companyA.id } });

    const res = await req('GET', `/bidpilot/tenders/${tender.id}?companyId=${companyA.id}`, { auth: authA });
    assert.equal(res.status, 200);
    const r = res.json.requirements[0];
    assert.equal(r.companyStatus, 'MEETS');
    assert.equal(r.companyEvidence[0].field, 'annualTurnover');
    assert.equal(r.companyEvidence[0].value, '80000000');
    // Original fields still present and correct alongside the new ones.
    assert.equal(r.description, 'Min turnover 5cr');
    assert.equal(r.evidence[0].sourcePage, 1);
  });
});
