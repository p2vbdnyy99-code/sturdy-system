import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterUploadMessage, allowanceToken, allowanceUsedUp, AUTO_START_GRACE_MS, blockedText, fileTooLarge, isFirstRun, isSettled,
  rowBlockedBy, shouldRequestAutoAnalysis, uploadNotice,
} from './firstRun.ts';

const trial = (remaining: number) => ({ kind: 'trial' as const, limit: 5, used: 5 - remaining, remaining });
const plan = (remaining: number) => ({ kind: 'plan' as const, planName: 'Starter', periodEnd: '2026-11-29', limit: 10, used: 10 - remaining, remaining });
const expired = { kind: 'plan_expired' as const, planName: 'Starter', periodEnd: '2026-10-01', limit: 0, used: 0, remaining: 0 };

test('the first-run panel shows only for a loaded summary with no tenders', () => {
  assert.equal(isFirstRun(null), false, 'not while the summary is loading or failed');
  assert.equal(isFirstRun({ totalTenders: 0 }), true);
  assert.equal(isFirstRun({ totalTenders: 1 }), false);
  assert.equal(isFirstRun({ totalTenders: 12 }), false);
});

test('the upload notice says the analysis starts by itself and what it uses, without promising a slot', () => {
  assert.equal(uploadNotice(trial(5), true),
    'When the PDF has been read, its analysis starts automatically if you still have a free tender left (5 now), and uses one. Re-running a tender is free.');
  assert.match(uploadNotice(trial(1), true), /if you still have a free tender left \(1 now\), and uses one/);
  assert.match(uploadNotice(plan(7), true), /if your Starter plan still has a tender left this month \(7 now\), and uses one/);
  assert.equal(uploadNotice(null, true), 'When the PDF has been read, its analysis starts automatically.');
});

test('with nothing left, the notice says the upload will be read but not analysed', () => {
  assert.match(uploadNotice(trial(0), true), /free tenders are used.*not analysed until you choose a plan/);
  assert.match(uploadNotice(plan(0), true), /Starter tenders are used/);
  assert.match(uploadNotice(expired, true), /plan has ended.*renew/);
  assert.equal(allowanceUsedUp(trial(0)), true);
  assert.equal(allowanceUsedUp(expired), true);
  assert.equal(allowanceUsedUp(trial(2)), false);
  assert.equal(allowanceUsedUp(null), false);
});

test('with automatic analysis off, the notice asks for the Analyze click', () => {
  assert.match(uploadNotice(trial(3), false), /^When the PDF has been read, click Analyze\. Each new tender you analyse uses 1 of your 3 free tenders left\.$/);
  assert.equal(uploadNotice(null, false), 'When the PDF has been read, click Analyze.');
  assert.doesNotMatch(uploadNotice(trial(3), false), /automatically/);
});

test('a blocked ready tender names the next step', () => {
  assert.deepEqual(blockedText('profile_incomplete').next, 'profile');
  assert.deepEqual(blockedText('trial_exhausted').next, 'pricing');
  assert.deepEqual(blockedText('plan_exhausted').next, 'contact');
  assert.deepEqual(blockedText('plan_expired').next, 'contact');
  assert.deepEqual(blockedText(null), { text: 'Not analysed yet.', next: null });
});

test('a file over the limit is caught before upload', () => {
  assert.equal(fileTooLarge(10 * 1024 * 1024, 50), null);
  assert.equal(fileTooLarge(50 * 1024 * 1024, 50), null, 'exactly the limit is allowed');
  assert.match(fileTooLarge(51 * 1024 * 1024, 50) ?? '', /larger than the 50 MB limit/);
  assert.equal(fileTooLarge(500 * 1024 * 1024, undefined), null, 'no limit known: the server decides');
});

test('polling waits briefly for the automatic start before showing a read tender as not analysed', () => {
  const read = { processingStatus: 'COMPLETED', analysisStatus: 'NOT_STARTED' };
  assert.equal(isSettled('processing', { processingStatus: 'EXTRACTING', analysisStatus: 'NOT_STARTED' }, 0), false);
  assert.equal(isSettled('processing', read, 0), false, 'just read: give the server a moment');
  assert.equal(isSettled('processing', read, AUTO_START_GRACE_MS), true, 'then show it as ready to analyse');
  assert.equal(isSettled('processing', { processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING' }, 0), true);
  assert.equal(isSettled('processing', { processingStatus: 'FAILED', analysisStatus: 'NOT_STARTED' }, 0), true);
  assert.equal(isSettled('analysis', { processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING' }), false);
  assert.equal(isSettled('analysis', { processingStatus: 'COMPLETED', analysisStatus: 'FAILED' }), true);
});

// I1: the automatic start is asked for only under a notice that said so,
// from an allowance that still holds just before the upload.
test('an exhausted trial, plan or ended plan never asks for the automatic start', () => {
  for (const used of [trial(0), plan(0), expired]) {
    assert.equal(shouldRequestAutoAnalysis(true, used, used), false, used.kind);
  }
});

test('an eligible user under an accurate notice asks for it', () => {
  assert.equal(shouldRequestAutoAnalysis(true, trial(3), trial(3)), true);
  assert.equal(shouldRequestAutoAnalysis(true, trial(3), trial(1)), true, 'fewer left, still one: the notice said "if you still have one"');
  assert.equal(shouldRequestAutoAnalysis(true, plan(4), plan(4)), true);
  assert.equal(shouldRequestAutoAnalysis(true, null, null), true, 'no limit');
});

test('anything unknown or changed since the notice was shown means no request (M1)', () => {
  assert.equal(shouldRequestAutoAnalysis(false, trial(3), trial(3)), false, 'setting off');
  assert.equal(shouldRequestAutoAnalysis(true, undefined, trial(3)), false, 'no notice shown yet');
  assert.equal(shouldRequestAutoAnalysis(true, trial(3), undefined), false, 're-read failed');
  assert.equal(shouldRequestAutoAnalysis(true, trial(1), trial(0)), false, 'used up in another tab');
  assert.equal(shouldRequestAutoAnalysis(true, trial(0), trial(5)), false, 'notice said it would not be analysed');
  assert.equal(shouldRequestAutoAnalysis(true, trial(0), plan(10)), false, 'a plan started after the page loaded');
  assert.equal(shouldRequestAutoAnalysis(true, trial(2), plan(10)), false, 'a free-tender notice never covers a plan slot');
  assert.equal(shouldRequestAutoAnalysis(true, plan(2), { ...plan(10), planName: 'Pro' }), false, 'another plan');
  assert.equal(shouldRequestAutoAnalysis(true, null, trial(5)), false, 'no-limit notice, limited now');
});

test('the message after upload matches what was asked for', () => {
  const asked = afterUploadMessage({ duplicate: false, requested: true, allowance: trial(3) });
  assert.match(asked, /the analysis starts by itself if your allowance and today.s limits allow/);
  assert.match(asked, /or with the next step if it couldn.t start/, 'a server-side refusal is foreseen, not hidden');
  const usedTrial = afterUploadMessage({ duplicate: false, requested: false, allowance: trial(0) });
  assert.equal(usedTrial, 'Uploaded. Your free tenders are used: it will be read but not analysed until you choose a plan.');
  assert.doesNotMatch(usedTrial, /starts by itself|starts automatically/);
  assert.match(afterUploadMessage({ duplicate: false, requested: false, allowance: plan(0) }), /^Uploaded\. This month's Starter tenders are used: it will be read but not analysed/);
  assert.match(afterUploadMessage({ duplicate: false, requested: false, allowance: expired }), /plan has ended: it will be read but not analysed until you renew/);
  assert.equal(afterUploadMessage({ duplicate: false, requested: false, allowance: trial(3) }),
    'Uploaded. TenderTez is reading it now. When it has been read, click Analyze.');
  assert.equal(afterUploadMessage({ duplicate: false, requested: false, allowance: undefined }),
    'Uploaded. TenderTez is reading it now. When it has been read, click Analyze.');
  assert.match(afterUploadMessage({ duplicate: true, requested: true, allowance: trial(3) }), /already uploaded this PDF/);
});

test('a never-analysed row offers the plans once the allowance is used up (M3)', () => {
  assert.equal(rowBlockedBy(trial(0)), 'trial_exhausted');
  assert.equal(rowBlockedBy(plan(0)), 'plan_exhausted');
  assert.equal(rowBlockedBy(expired), 'plan_expired');
  assert.equal(rowBlockedBy(trial(2)), null);
  assert.equal(rowBlockedBy(null), null);
  assert.equal(rowBlockedBy(undefined), null);
  assert.equal(blockedText(rowBlockedBy(trial(0))).next, 'pricing');
});

// The upload names the allowance kind its notice described, in the server's
// own format (backend analysis/budget.js entitlementKey), so the server can
// refuse the automatic start if the company's entitlement changed by then.
test('the request names the allowance kind the notice described', () => {
  assert.equal(allowanceToken(trial(3)), 'trial');
  assert.equal(allowanceToken(plan(7)), 'plan:Starter');
  assert.equal(allowanceToken(null), 'unlimited');
  assert.equal(allowanceToken(expired), 'plan_expired:Starter');
});

test('a tender skipped because the allowance changed asks the user to check it, then Analyze', () => {
  const t = blockedText('allowance_changed');
  assert.equal(t.next, 'confirm');
  assert.match(t.text, /free trial or plan changed after you uploaded it\. Check what you have now, then click Analyze\./);
});
