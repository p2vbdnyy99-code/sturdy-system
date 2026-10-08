// Provider-level reasoning/output config tests.
// Stubs each SDK client's request method (no network) and asserts the exact
// request each provider builds when a reasoning-effort hint is passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/ai/openai.js';
import { AnthropicProvider } from '../src/ai/anthropic.js';

test('OpenAI maps reasoningEffort → reasoning.effort and sets max_output_tokens', async () => {
  const p = new OpenAIProvider({ apiKey: 'sk-x', model: 'gpt-5.6-terra', timeoutMs: 5000 });
  let req;
  p.client.responses.create = async (r) => {
    req = r;
    return { output_text: 'ok' };
  };
  await p.complete({ system: 'S', user: 'U', maxTokens: 768, reasoningEffort: 'minimal' });
  assert.equal(req.model, 'gpt-5.6-terra');
  assert.equal(req.max_output_tokens, 768);
  assert.deepEqual(req.reasoning, { effort: 'minimal' });
  assert.equal(req.instructions, 'S');
  assert.equal(req.input, 'U');
});

test('OpenAI omits the reasoning param when no effort is requested', async () => {
  const p = new OpenAIProvider({ apiKey: 'sk-x', model: 'gpt-5.6-terra', timeoutMs: 5000 });
  let req;
  p.client.responses.create = async (r) => {
    req = r;
    return { output_text: 'ok' };
  };
  await p.complete({ system: 'S', user: 'U', maxTokens: 1200 });
  assert.ok(!('reasoning' in req), 'no reasoning key → model default effort');
  assert.equal(req.max_output_tokens, 1200);
});

test('Anthropic ignores reasoningEffort and preserves its Messages request shape', async () => {
  const p = new AnthropicProvider({ apiKey: 'sk-x', model: 'claude-opus-5', timeoutMs: 5000 });
  let req;
  p.client.messages.create = async (r) => {
    req = r;
    return { content: [{ type: 'text', text: 'ok' }] };
  };
  const out = await p.complete({ system: 'S', user: 'U', maxTokens: 768, reasoningEffort: 'minimal' });
  assert.equal(out, 'ok');
  assert.ok(!('reasoning' in req), 'Anthropic provider must not send a reasoning param');
  assert.equal(req.max_tokens, 768);
  assert.equal(req.system, 'S');
  assert.deepEqual(req.messages, [{ role: 'user', content: 'U' }]);
});
