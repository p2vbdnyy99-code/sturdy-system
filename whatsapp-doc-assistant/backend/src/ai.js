// AI reasoning over documents, via the Anthropic Claude API.
// -----------------------------------------------------------------------------
// One server-side API key powers every capability: summaries, Q&A, translation,
// "explain like I'm 10", table extraction, and natural-language intent routing.

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { log } from './logger.js';

const anthropic = new Anthropic({ apiKey: config.ai.apiKey });
const MODEL = config.ai.model;

// Cap how much document text we feed the model per request. Generous enough for
// most real documents, low enough to bound latency and token cost. Longer docs
// are truncated with a note appended to the prompt.
const MAX_DOC_CHARS = 200_000;

function clip(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_DOC_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, MAX_DOC_CHARS), truncated: true };
}

/** Run a single-turn completion and return the concatenated text output. */
async function complete({ system, user, maxTokens = 1500 }) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: user }],
  });
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// ─── Document capabilities ───────────────────────────────────────────────────

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

/**
 * Map free-text like "make this a word doc" or "what does clause 4 say?" onto a
 * menu action. Returns `{ intent, question?, language? }`. Falls back to a
 * keyword heuristic if the model output can't be parsed.
 */
export async function classifyIntent(userText) {
  const heuristic = keywordIntent(userText);

  try {
    const raw = await complete({
      system:
        'You route a user message about a document they already sent to ONE ' +
        'action. Reply with ONLY a JSON object, no prose. Schema: ' +
        '{"intent": one of ' +
        JSON.stringify(INTENTS) +
        ', "question": string (only for "ask"), "language": string (only for ' +
        '"translate")}. Use "ask" when they pose a question about the content. ' +
        'Use "menu" when they ask what you can do. Use "unknown" if unclear.',
      user: userText,
      maxTokens: 200,
    });
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

/** Cheap, offline fallback so routing still works if the model call fails. */
function keywordIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(help|menu|option|what can you|commands?)\b/.test(t)) return { intent: 'menu' };
  if (/\b(word|docx|\.doc)\b/.test(t)) return { intent: 'convert_word' };
  if (/\b(table|spreadsheet|rows?|columns?)\b/.test(t)) return { intent: 'extract_tables' };
  if (/\b(translate|translation|in (hindi|spanish|french|german|arabic|chinese))\b/.test(t)) {
    const m = t.match(/in ([a-z]+)/);
    return { intent: 'translate', language: m ? m[1] : undefined };
  }
  if (/\b(eli5|explain.*(simpl|like i'?m|to a kid|10))\b/.test(t)) return { intent: 'eli' };
  if (/\b(summar|tl;?dr|overview|gist)\b/.test(t)) return { intent: 'summarize' };
  if (/\?\s*$/.test(text || '') || /\b(what|why|how|who|when|where|which)\b/.test(t)) {
    return { intent: 'ask', question: text };
  }
  return { intent: 'unknown' };
}
