// AI facade — provider-independent document operations.
// -----------------------------------------------------------------------------
// The rest of the app imports ONLY this module and calls summarize / answer /
// translate / explainSimply / extractTables / classifyIntent. It has no idea
// which provider is behind them. Prompts live here (provider-independent); the
// selected provider supplies the raw `complete()` transport.

import { config } from '../config.js';
import { log } from '../logger.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { AIError } from './errors.js';

export { AIError, AI_ERROR_CODES } from './errors.js';

// ─── Provider selection ──────────────────────────────────────────────────────

/**
 * Construct the provider named by config. Throws AIError('not_configured') if
 * the selected provider's API key is missing, or if the provider is unknown
 * (config validation normally rejects unknown providers before this).
 */
export function createProvider(ai = config.ai) {
  switch (ai.provider) {
    case 'openai':
      return new OpenAIProvider({ apiKey: ai.openaiKey, model: ai.model, timeoutMs: ai.timeoutMs });
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: ai.anthropicKey,
        model: ai.model,
        timeoutMs: ai.timeoutMs,
      });
    default:
      throw new AIError('not_configured', `Unsupported AI provider "${ai.provider}".`);
  }
}

let _provider = null;

/** Lazily construct (once) and return the active provider. */
export function getProvider() {
  if (!_provider) _provider = createProvider();
  return _provider;
}

/** Replace the active provider. Used by tests to inject a mock. */
export function setProvider(provider) {
  _provider = provider;
}

const complete = (args) => getProvider().complete(args);

// ─── Document capabilities ───────────────────────────────────────────────────

// Cap how much document text we feed the model per request. Generous enough for
// most real documents, low enough to bound latency and token cost. Longer docs
// are truncated with a note appended to the prompt.
const MAX_DOC_CHARS = 200_000;

function clip(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_DOC_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, MAX_DOC_CHARS), truncated: true };
}

export async function summarize(docText, filename) {
  const { text, truncated } = clip(docText);
  const note = truncated ? '\n\n(Note: the document was truncated for length.)' : '';
  return complete({
    system:
      'You summarize documents for a busy person reading on their phone. Be ' +
      'accurate and concise. Use short paragraphs and bullet points. Lead with ' +
      'a one-line takeaway, then key points. Never invent facts.',
    user: `Summarize this document${filename ? ` ("${filename}")` : ''}:\n\n${text}${note}`,
    maxTokens: 1200,
  });
}

export async function answer(docText, question, history = []) {
  const { text } = clip(docText);
  const priorQa = history
    .slice(-4)
    .map((h) => `Q: ${h.q}\nA: ${h.a}`)
    .join('\n\n');
  return complete({
    system:
      'You answer questions strictly about the provided document. If the answer ' +
      'is not in the document, say so plainly. Quote or cite page/section when ' +
      'helpful. Keep answers tight and mobile-friendly.',
    user:
      `Document:\n${text}\n\n` +
      (priorQa ? `Earlier in this chat:\n${priorQa}\n\n` : '') +
      `Question: ${question}`,
    maxTokens: 1200,
  });
}

export async function translate(docText, targetLanguage) {
  const { text, truncated } = clip(docText);
  const note = truncated ? '\n\n(Note: the document was truncated for length.)' : '';
  return complete({
    system:
      'You are a professional translator. Translate faithfully, preserving ' +
      'meaning, tone, and structure. Output only the translation, no preamble.',
    user: `Translate the following into ${targetLanguage}:\n\n${text}${note}`,
    maxTokens: 3000,
  });
}

export async function explainSimply(docText, filename) {
  const { text } = clip(docText);
  return complete({
    system:
      'Explain documents so a curious 10-year-old understands. Use plain words, ' +
      'short sentences, and friendly analogies. Stay accurate.',
    user: `Explain this document${filename ? ` ("${filename}")` : ''} simply:\n\n${text}`,
    maxTokens: 1200,
  });
}

export async function extractTables(docText) {
  const { text } = clip(docText);
  return complete({
    system:
      'You extract tabular data from documents and render it as clean Markdown ' +
      'tables. If there are multiple tables, separate them with a heading. If ' +
      'there are no tables, say so clearly.',
    user: `Find and reproduce every table in this document as Markdown:\n\n${text}`,
    maxTokens: 2500,
  });
}

// ─── Natural-language intent routing ─────────────────────────────────────────

const INTENTS = [
  'summarize',
  'ask',
  'convert_word',
  'extract_tables',
  'translate',
  'eli',
  'menu',
  'unknown',
];

const ROUTER_SYSTEM =
  'You route a user message about a document they already sent to ONE action. ' +
  'Reply with ONLY a JSON object, no prose. Schema: {"intent": one of ' +
  JSON.stringify(INTENTS) +
  ', "question": string (only for "ask"), "language": string (only for ' +
  '"translate")}. Use "ask" when they pose a question about the content. Use ' +
  '"menu" when they ask what you can do. Use "unknown" if unclear.';

/**
 * Map free-text like "make this a word doc" or "what does clause 4 say?" onto a
 * menu action. Returns `{ intent, question?, language? }`.
 *
 * Deterministic-first: obvious commands are matched by keyword rules WITHOUT an
 * LLM call. Only genuinely ambiguous messages fall through to the model (which
 * itself falls back to the keyword result if the call fails or won't parse).
 */
export async function classifyIntent(userText) {
  const heuristic = keywordIntent(userText);

  // Obvious command — resolved locally, no LLM request needed.
  if (heuristic.intent !== 'unknown') return heuristic;

  // Ambiguous — ask the model to route.
  try {
    const raw = await complete({ system: ROUTER_SYSTEM, user: userText, maxTokens: 200 });
    const parsed = safeJson(raw);
    if (parsed && INTENTS.includes(parsed.intent)) {
      return {
        intent: parsed.intent,
        question: typeof parsed.question === 'string' ? parsed.question : undefined,
        language: typeof parsed.language === 'string' ? parsed.language : undefined,
      };
    }
  } catch (err) {
    log.warn('classifyIntent model call failed, using heuristic:', err.message);
  }
  return heuristic;
}

/** Extract the first JSON object from a model reply, tolerating stray text. */
function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Deterministic keyword/rule matcher. Returns a concrete intent for obvious
 * commands and `unknown` when the message needs the model to disambiguate.
 */
function keywordIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(help|menu|options?|what can you|commands?)\b/.test(t)) return { intent: 'menu' };
  if (/\b(word|docx)\b|\.docx?\b/.test(t)) return { intent: 'convert_word' };
  if (/\btables?\b|\bspreadsheet\b|\bcolumns?\b|\brows?\b/.test(t)) {
    return { intent: 'extract_tables' };
  }
  if (/\btranslat\w*/.test(t) || /\b(?:in|to|into)\s+(hindi|spanish|french|german|arabic|chinese|english|tamil|telugu|bengali|marathi)\b/.test(t)) {
    // Capture the target language from "translate to/into/in <language>".
    const m = t.match(/(?:into|in|to)\s+([a-z]+)/);
    return { intent: 'translate', language: m ? m[1] : undefined };
  }
  if (/\beli5\b|\bexplain\b.*(simpl|like i'?m|to a kid|\b10\b)/.test(t)) return { intent: 'eli' };
  if (/\bsummar\w*/.test(t) || /\btl;?dr\b/.test(t) || /\b(overview|gist)\b/.test(t)) {
    return { intent: 'summarize' };
  }
  if (/\?\s*$/.test(text || '') || /\b(what|why|how|who|when|where|which)\b/.test(t)) {
    return { intent: 'ask', question: text };
  }
  return { intent: 'unknown' };
}
