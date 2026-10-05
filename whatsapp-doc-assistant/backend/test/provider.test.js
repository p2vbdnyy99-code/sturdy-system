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

// OpenAI Flex tier: half price, same model. Each scripted outcome is one SDK
// call; an Error is thrown, anything else returned. No network.
function flexProvider(outcomes) {
  const p = createProvider({ provider: 'openai', model: 'm', timeoutMs: 60_000, openaiKey: 'sk-openai' });
  const calls = [];
  p.client = {
    responses: {
      create: async (body, options) => {
        calls.push({ body, options });
        const next = outcomes.shift();
        if (next instanceof Error) throw next;
        return next ?? { output_text: 'standard answer' };
      },
    },
  };
  return { p, calls };
}
const apiError = (status, code, message = `${status} error`) => Object.assign(new Error(message), { status, code });
const FLEX = { timeoutMs: 120_000 };

test('openai flex: asks for the flex tier, with its own timeout and no SDK retries', async () => {
  const { p, calls } = flexProvider([{ output_text: 'flex answer', service_tier: 'flex' }]);
  const out = await p.complete({ user: 'hi', timeoutMs: 180_000, maxRetries: 1, flex: FLEX });
  assert.equal(out, 'flex answer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.service_tier, 'flex');
  assert.deepEqual(calls[0].options, { timeout: 120_000, maxRetries: 0 });
});

test('openai flex: no capacity (429) falls back once to standard with the caller\'s options', async () => {
  const { p, calls } = flexProvider([apiError(429, 'resource_unavailable', 'Resource Unavailable')]);
  const out = await p.complete({ user: 'hi', timeoutMs: 180_000, maxRetries: 1, flex: FLEX });
  assert.equal(out, 'standard answer');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.service_tier, undefined);
  assert.deepEqual(calls[1].options, { timeout: 180_000, maxRetries: 1 });
});

test('openai flex: a flex timeout or server error also falls back to standard', async () => {
  for (const err of [Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }), apiError(503)]) {
    const { p, calls } = flexProvider([err]);
    assert.equal(await p.complete({ user: 'hi', flex: FLEX }), 'standard answer');
    assert.equal(calls.length, 2);
  }
});

test('openai flex: out of credit is not retried (standard would fail the same way)', async () => {
  const { p, calls } = flexProvider([apiError(429, 'insufficient_quota')]);
  await assert.rejects(p.complete({ user: 'hi', flex: FLEX }), (err) => err.code === 'rate_limit');
  assert.equal(calls.length, 1);
});

test('openai flex: the model refusing flex (400) still completes on standard', async () => {
  const { p, calls } = flexProvider([apiError(400, 'invalid_request_error', "service_tier 'flex' is not supported")]);
  assert.equal(await p.complete({ user: 'hi', flex: FLEX }), 'standard answer');
  assert.equal(calls.length, 2);
});

test('openai flex: bad credentials are not retried', async () => {
  const { p, calls } = flexProvider([apiError(401, 'invalid_api_key')]);
  await assert.rejects(p.complete({ user: 'hi', flex: FLEX }), (err) => err.code === 'invalid_key');
  assert.equal(calls.length, 1);
});

test('openai: without flex the request has no service_tier (Papyr and eligibility unchanged)', async () => {
  const { p, calls } = flexProvider([]);
  await p.complete({ user: 'hi' });
  assert.equal(calls[0].body.service_tier, undefined);
});
