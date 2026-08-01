// Application-behavior tests — with a mocked provider (no real API calls).
// Verifies the high-level operations still call through correctly and that
// obvious commands are routed WITHOUT an LLM request.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setProvider,
  summarize,
  answer,
  translate,
  explainSimply,
  extractTables,
  classifyIntent,
  AIError,
} from '../src/ai/index.js';

/** A provider that records calls and returns a canned reply. */
function mockProvider(reply = 'MOCK_OUTPUT') {
  return {
    name: 'mock',
    calls: [],
    async complete(args) {
      this.calls.push(args);
      return typeof reply === 'function' ? reply(args) : reply;
    },
  };
}

let mock;
beforeEach(() => {
  mock = mockProvider();
  setProvider(mock);
});

test('summarize() calls the provider with the doc text and returns its output', async () => {
  const out = await summarize('DOC BODY', 'report.pdf');
  assert.equal(out, 'MOCK_OUTPUT');
  assert.equal(mock.calls.length, 1);
  assert.match(mock.calls[0].system, /summarize/i);
  assert.match(mock.calls[0].user, /DOC BODY/);
  assert.match(mock.calls[0].user, /report\.pdf/);
});

test('answer() includes the question and document', async () => {
  await answer('DOC BODY', 'What is the revenue?');
  assert.match(mock.calls[0].user, /DOC BODY/);
  assert.match(mock.calls[0].user, /What is the revenue\?/);
});

test('translate() names the target language', async () => {
  await translate('DOC BODY', 'Hindi');
  assert.match(mock.calls[0].user, /into Hindi/);
  assert.match(mock.calls[0].user, /DOC BODY/);
});

test('explainSimply() uses the explain-simply system prompt', async () => {
  await explainSimply('DOC BODY', 'report.pdf');
  assert.match(mock.calls[0].system, /10-year-old/);
});

test('extractTables() asks for Markdown tables', async () => {
  await extractTables('DOC BODY');
  assert.match(mock.calls[0].user, /table/i);
});

test('classifyIntent() resolves obvious commands WITHOUT an LLM call', async () => {
  for (const [text, intent] of [
    ['summarize this', 'summarize'],
    ['convert to word', 'convert_word'],
    ['extract tables', 'extract_tables'],
    ['translate to Hindi', 'translate'],
  ]) {
    const res = await classifyIntent(text);
    assert.equal(res.intent, intent, `"${text}" → ${intent}`);
  }
  assert.equal(mock.calls.length, 0, 'no provider calls for obvious commands');
});

test('classifyIntent() extracts the translation language deterministically', async () => {
  const res = await classifyIntent('translate to Hindi');
  assert.equal(res.intent, 'translate');
  assert.equal(res.language, 'hindi');
  assert.equal(mock.calls.length, 0);
});

test('classifyIntent() falls through to the model only when ambiguous', async () => {
  setProvider(mockProvider('{"intent":"summarize"}'));
  const res = await classifyIntent('hmm, the thing about page fifteen');
  assert.equal(res.intent, 'summarize');
});

test('an AIError from the provider propagates and has a safe userMessage', async () => {
  setProvider({
    name: 'boom',
    async complete() {
      throw new AIError('rate_limit', 'internal: 429 from upstream key sk-secret');
    },
  });
  await assert.rejects(() => summarize('DOC'), (err) => {
    assert.ok(err instanceof AIError);
    assert.equal(err.code, 'rate_limit');
    assert.doesNotMatch(err.userMessage, /sk-secret|429/); // no secrets/detail leak
    return true;
  });
});
