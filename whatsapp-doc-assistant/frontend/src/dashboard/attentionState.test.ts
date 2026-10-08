// Dependency-free — runs via `node --test src/dashboard/attentionState.test.ts`
// directly (Node 22's built-in TS type-stripping), no frontend test
// framework needed, matching the M5b precedent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Explicit .ts extension: this file runs directly under `node --test`
// (Node's own ESM resolver, not Vite's), which requires it. tsconfig.app.json
// already sets allowImportingTsExtensions for exactly this.
import { deriveAttentionState } from './attentionState.ts';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const isoDaysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

test('deriveAttentionState', async (t) => {
  await t.test('processing states win regardless of analysisStatus', () => {
    for (const processingStatus of ['UPLOADED', 'PROCESSING', 'EXTRACTING'] as const) {
      for (const analysisStatus of ['NOT_STARTED', 'ANALYZING', 'COMPLETED', 'FAILED'] as const) {
        const state = deriveAttentionState({ processingStatus, analysisStatus, submissionDeadline: null }, NOW);
        assert.equal(state, 'PROCESSING', `${processingStatus}/${analysisStatus}`);
      }
    }
  });

  await t.test('a FAILED processing status wins over any analysisStatus', () => {
    for (const analysisStatus of ['NOT_STARTED', 'ANALYZING', 'COMPLETED', 'FAILED'] as const) {
      const state = deriveAttentionState(
        { processingStatus: 'FAILED', analysisStatus, submissionDeadline: null }, NOW,
      );
      assert.equal(state, 'PROCESSING_FAILED', analysisStatus);
    }
  });

  await t.test('COMPLETED processing + NOT_STARTED analysis -> analysis required', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'NOT_STARTED', submissionDeadline: null }, NOW,
    );
    assert.equal(state, 'ANALYSIS_REQUIRED');
  });

  await t.test('ANALYZING -> analysis in progress', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'ANALYZING', submissionDeadline: null }, NOW,
    );
    assert.equal(state, 'ANALYSIS_IN_PROGRESS');
  });

  await t.test('analysis FAILED -> analysis failed', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'FAILED', submissionDeadline: null }, NOW,
    );
    assert.equal(state, 'ANALYSIS_FAILED');
  });

  await t.test('COMPLETED + COMPLETED + no deadline -> ready', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: null }, NOW,
    );
    assert.equal(state, 'READY');
  });

  await t.test('a deadline 3 days out is within the window -> deadline approaching', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: isoDaysFromNow(3) }, NOW,
    );
    assert.equal(state, 'DEADLINE_APPROACHING');
  });

  await t.test('a deadline exactly at "now" is inside the window (inclusive)', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: NOW.toISOString() }, NOW,
    );
    assert.equal(state, 'DEADLINE_APPROACHING');
  });

  await t.test('a deadline exactly 7 days out is inside the window (inclusive)', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: isoDaysFromNow(7) }, NOW,
    );
    assert.equal(state, 'DEADLINE_APPROACHING');
  });

  await t.test('a deadline just past the 7-day window is ready, not approaching', () => {
    const state = deriveAttentionState(
      {
        processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED',
        submissionDeadline: new Date(NOW.getTime() + 7 * 86_400_000 + 1).toISOString(),
      },
      NOW,
    );
    assert.equal(state, 'READY');
  });

  await t.test('a deadline 1ms in the past is ready — no separate "overdue" state', () => {
    const state = deriveAttentionState(
      {
        processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED',
        submissionDeadline: new Date(NOW.getTime() - 1).toISOString(),
      },
      NOW,
    );
    assert.equal(state, 'READY');
  });

  await t.test('a deadline far in the past is ready', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: isoDaysFromNow(-90) }, NOW,
    );
    assert.equal(state, 'READY');
  });

  await t.test('a deadline far in the future (outside the 7-day window) is ready', () => {
    const state = deriveAttentionState(
      { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: isoDaysFromNow(90) }, NOW,
    );
    assert.equal(state, 'READY');
  });

  await t.test('a non-parseable deadline string never throws and falls through to ready', () => {
    assert.doesNotThrow(() => {
      const state = deriveAttentionState(
        { processingStatus: 'COMPLETED', analysisStatus: 'COMPLETED', submissionDeadline: 'within 30 days of opening' },
        NOW,
      );
      assert.equal(state, 'READY');
    });
  });
});
