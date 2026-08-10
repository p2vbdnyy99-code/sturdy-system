// Configuration tests — provider selection and validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiConfig, selectedApiKey, selectedKeyName, buildExtractConfig } from '../src/config.js';

test('AI_PROVIDER=openai resolves the OpenAI provider + default model', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-openai' });
  assert.equal(ai.provider, 'openai');
  assert.equal(ai.model, 'gpt-5.6-terra');
  assert.equal(selectedApiKey(ai), 'sk-openai');
  assert.equal(selectedKeyName(ai), 'OPENAI_API_KEY');
});

test('AI_PROVIDER=anthropic resolves the Anthropic provider + default model', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant' });
  assert.equal(ai.provider, 'anthropic');
  assert.equal(ai.model, 'claude-opus-5');
  assert.equal(selectedApiKey(ai), 'sk-ant');
  assert.equal(selectedKeyName(ai), 'ANTHROPIC_API_KEY');
});

test('AI_MODEL overrides the per-provider default', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4.1-mini', OPENAI_API_KEY: 'x' });
  assert.equal(ai.model, 'gpt-4.1-mini');
});

test('DEFAULT_MODEL is accepted as a back-compat alias for AI_MODEL', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'anthropic', DEFAULT_MODEL: 'claude-3-7', ANTHROPIC_API_KEY: 'x' });
  assert.equal(ai.model, 'claude-3-7');
});

test('default provider is openai when AI_PROVIDER is unset', () => {
  const ai = buildAiConfig({});
  assert.equal(ai.provider, 'openai');
});

test('an unsupported provider fails immediately with a clear error', () => {
  assert.throws(() => buildAiConfig({ AI_PROVIDER: 'gemini' }), /Unsupported AI_PROVIDER "gemini"/);
  assert.throws(() => buildAiConfig({ AI_PROVIDER: 'bogus' }), /Supported providers: openai, anthropic/);
});

test('missing selected provider key does not throw here (key is empty, warned later)', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'openai' }); // no OPENAI_API_KEY
  assert.equal(selectedApiKey(ai), '');
  // The other provider's key must not be required for the selected provider.
  const ai2 = buildAiConfig({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'sk-ant' });
  assert.equal(selectedApiKey(ai2), '');
});

test('buildExtractConfig: defaults and overrides for the isolated extraction child', () => {
  const d = buildExtractConfig({});
  assert.equal(d.timeoutMs, 120_000);
  assert.equal(d.maxHeapMb, 256);

  const o = buildExtractConfig({ EXTRACT_TIMEOUT_MS: '30000', EXTRACT_MAX_HEAP_MB: '128' });
  assert.equal(o.timeoutMs, 30_000);
  assert.equal(o.maxHeapMb, 128);

  // Defensive flooring, matching the rest of config.js's numeric parsing.
  assert.equal(buildExtractConfig({ EXTRACT_TIMEOUT_MS: '10' }).timeoutMs, 1000);
  assert.equal(buildExtractConfig({ EXTRACT_MAX_HEAP_MB: '8' }).maxHeapMb, 64);
  assert.equal(buildExtractConfig({ EXTRACT_TIMEOUT_MS: 'nope' }).timeoutMs, 120_000);
});

test('buildMetricsConfig + hashSender: user counting is opt-in and privacy-safe', async () => {
  const { buildMetricsConfig, hashSender } = await import('../src/config.js');

  // No salt -> disabled: the phone number is never logged.
  assert.equal(buildMetricsConfig({}).hashSalt, '');
  assert.equal(hashSender('+15551234567', ''), '', 'no salt yields no tag');

  // With a salt -> a short, stable, pseudonymous tag (not the number itself).
  const salt = 'a-real-secret-salt';
  const tag = hashSender('+15551234567', salt);
  assert.match(tag, /^[0-9a-f]{12}$/, 'short hex hash');
  assert.notEqual(tag, '+15551234567');
  assert.equal(hashSender('+15551234567', salt), tag, 'stable for the same sender');
  assert.notEqual(hashSender('+15559999999', salt), tag, 'differs across senders');

  // Different salts produce different hashes (so it isn't a fixed rainbow target).
  assert.notEqual(hashSender('+15551234567', 'other-salt'), tag);
});

test('buildBudgetConfig: beta-safe defaults, overrides, and 0 = unlimited', async () => {
  const { buildBudgetConfig } = await import('../src/config.js');

  // Defaults when nothing is set.
  const d = buildBudgetConfig({});
  assert.equal(d.dailyAiCalls, 500);
  assert.equal(d.monthlyAiCalls, 5000);
  assert.equal(d.perUserDailyAiCalls, 50);

  // Explicit overrides are honored and floored to integers.
  const o = buildBudgetConfig({
    AI_DAILY_CALL_CAP: '100',
    AI_MONTHLY_CALL_CAP: '1000',
    AI_PER_USER_DAILY_CALL_CAP: '5.9',
  });
  assert.equal(o.dailyAiCalls, 100);
  assert.equal(o.monthlyAiCalls, 1000);
  assert.equal(o.perUserDailyAiCalls, 5);

  // 0 is a valid, meaningful value ("unlimited") — not replaced by the default.
  const z = buildBudgetConfig({
    AI_DAILY_CALL_CAP: '0',
    AI_MONTHLY_CALL_CAP: '0',
    AI_PER_USER_DAILY_CALL_CAP: '0',
  });
  assert.equal(z.dailyAiCalls, 0);
  assert.equal(z.monthlyAiCalls, 0);
  assert.equal(z.perUserDailyAiCalls, 0);

  // Garbage / negative falls back to the default (never a broken cap).
  assert.equal(buildBudgetConfig({ AI_DAILY_CALL_CAP: 'nope' }).dailyAiCalls, 500);
  assert.equal(buildBudgetConfig({ AI_MONTHLY_CALL_CAP: '-10' }).monthlyAiCalls, 5000);
});
