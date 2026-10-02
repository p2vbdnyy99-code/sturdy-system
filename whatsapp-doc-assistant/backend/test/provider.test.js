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

// Per-call timeout/retry overrides reach the SDK as request options (the 2nd
// argument), and are absent when a caller doesn't ask — so Papyr's calls keep
// the client-wide defaults. The SDK client is stubbed: no network.
function stubbedProvider(provider, model) {
  const p = createProvider({ provider, model, timeoutMs: 60_000, openaiKey: 'sk-openai', anthropicKey: 'sk-ant' });
  const calls = [];
  const create = async (body, options) => {
    calls.push(options);
    return provider === 'openai' ? { output_text: 'ok' } : { content: [{ type: 'text', text: 'ok' }] };
  };
  if (provider === 'openai') p.client = { responses: { create } };
  else p.client = { messages: { create } };
  return { p, calls };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: complete() forwards timeoutMs/maxRetries as SDK request options`, async () => {
    const { p, calls } = stubbedProvider(provider, 'm');
    await p.complete({ user: 'hi', timeoutMs: 180_000, maxRetries: 1 });
    assert.deepEqual(calls[0], { timeout: 180_000, maxRetries: 1 });
  });

  test(`${provider}: complete() without overrides passes no request options`, async () => {
    const { p, calls } = stubbedProvider(provider, 'm');
    await p.complete({ user: 'hi' });
    assert.deepEqual(calls[0], {});
  });
}
