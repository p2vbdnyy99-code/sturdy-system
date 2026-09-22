// Provider routing tests — the factory picks the right provider, and a missing
// key for the selected provider fails clearly. No network calls are made
// (constructing an SDK client is offline; we never call .complete()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, AIError } from '../src/ai/index.js';

test('AI_PROVIDER=openai → OpenAI provider instance', () => {
  const p = createProvider({
    provider: 'openai',
    model: 'gpt-4o',
    timeoutMs: 60_000,
    openaiKey: 'sk-openai',
    anthropicKey: '',
  });
  assert.equal(p.name, 'openai');
  assert.equal(p.model, 'gpt-4o');
});

test('AI_PROVIDER=anthropic → Anthropic provider instance', () => {
  const p = createProvider({
    provider: 'anthropic',
    model: 'claude-opus-5',
    timeoutMs: 60_000,
    openaiKey: '',
    anthropicKey: 'sk-ant',
  });
  assert.equal(p.name, 'anthropic');
  assert.equal(p.model, 'claude-opus-5');
});

test('missing OpenAI key throws AIError(not_configured)', () => {
  assert.throws(
    () => createProvider({ provider: 'openai', model: 'gpt-4o', openaiKey: '', anthropicKey: 'sk-ant' }),
    (err) => err instanceof AIError && err.code === 'not_configured',
  );
});

test('missing Anthropic key throws AIError(not_configured)', () => {
  assert.throws(
    () => createProvider({ provider: 'anthropic', model: 'claude-opus-5', openaiKey: 'sk-openai', anthropicKey: '' }),
    (err) => err instanceof AIError && err.code === 'not_configured',
  );
});

test('unknown provider throws AIError(not_configured)', () => {
  assert.throws(
    () => createProvider({ provider: 'gemini', model: 'x' }),
    (err) => err instanceof AIError && err.code === 'not_configured',
  );
});
