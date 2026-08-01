// Configuration tests — provider selection and validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiConfig, selectedApiKey, selectedKeyName } from '../src/config.js';

test('AI_PROVIDER=openai resolves the OpenAI provider + default model', () => {
  const ai = buildAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-openai' });
  assert.equal(ai.provider, 'openai');
  assert.equal(ai.model, 'gpt-4o');
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
