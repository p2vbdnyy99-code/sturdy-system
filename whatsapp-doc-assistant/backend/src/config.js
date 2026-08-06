// Centralized configuration, read once from the environment.
// -----------------------------------------------------------------------------
// Everything the app needs is derived here so the rest of the code never touches
// `process.env` directly. Missing critical values produce loud warnings rather
// than silent misbehavior at request time.

import 'dotenv/config';
import path from 'node:path';

const {
  WHATSAPP_TOKEN = '',
  WHATSAPP_PHONE_NUMBER_ID = '',
  WHATSAPP_VERIFY_TOKEN = '',
  WHATSAPP_APP_SECRET = '',
  GRAPH_API_VERSION = 'v21.0',
  PORT = '8788',
  DATA_DIR = './data',
  MAX_PDF_MB = '20',
  MAX_PDF_PAGES = '300',
  MAX_TABLES = '50',
  CONVERSION_TIMEOUT_MS = '45000',
  SESSION_TTL_MINUTES = '60',
  RATE_LIMIT_PER_MIN = '20',
} = process.env;

// ─── AI provider selection ───────────────────────────────────────────────────

export const SUPPORTED_AI_PROVIDERS = ['openai', 'anthropic'];

// Default model per provider, used when AI_MODEL is not set.
const DEFAULT_MODELS = {
  openai: 'gpt-5.6-terra',
  anthropic: 'claude-opus-5',
};

/**
 * Build the AI configuration from an environment-like object. Kept pure (takes
 * `env`, returns an object) so it is easy to unit-test with different inputs.
 * Throws immediately on an unsupported provider — we never silently fall back.
 *
 * Env:
 *   AI_PROVIDER   openai | anthropic   (default: openai)
 *   AI_MODEL      model id             (default: per-provider; DEFAULT_MODEL is
 *                                       accepted as a back-compat alias)
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY (only the selected provider's is needed)
 *   AI_TIMEOUT_MS request timeout      (default: 60000)
 */
export function buildAiConfig(env = {}) {
  const provider = String(env.AI_PROVIDER || 'openai').trim().toLowerCase();
  if (!SUPPORTED_AI_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported AI_PROVIDER "${provider}". ` +
        `Supported providers: ${SUPPORTED_AI_PROVIDERS.join(', ')}.`,
    );
  }

  const model = String(
    env.AI_MODEL || env.DEFAULT_MODEL || DEFAULT_MODELS[provider],
  ).trim();

  return {
    provider,
    model,
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 60_000,
    openaiKey: env.OPENAI_API_KEY || '',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
  };
}

/**
 * Build the OCR configuration from an environment-like object. Kept pure, like
 * buildAiConfig, so it is easy to unit-test with different inputs.
 *
 * Env:
 *   OCR_DPI                        rasterization resolution (default: 200)
 *   MAX_OCR_PAGES                  per-document OCR page cap (default: 15)
 *   SCANNED_CHARS_PER_PAGE         per-page "looks scanned" threshold (default: 40)
 *   OCR_LOW_CONFIDENCE_THRESHOLD   flag-as-uncertain threshold, 0-100 (default: 45)
 *   OCR_TIMEOUT_MS                 wall-clock cap on extraction+OCR for one
 *                                  request (default: 180000 / 3 minutes) —
 *                                  deliberately separate from
 *                                  CONVERSION_TIMEOUT_MS: OCR scales with page
 *                                  count/image complexity in a way DOCX/XLSX
 *                                  generation doesn't, and needs its own budget.
 *   OCR_MAX_HEAP_MB                V8 old-space cap for the isolated OCR child
 *                                  process (default: 256). Keeps a runaway
 *                                  allocation inside the child, where it dies
 *                                  as a reportable error, instead of pushing
 *                                  the whole container over its memory limit
 *                                  and getting the server SIGKILLed.
 */
export function buildOcrConfig(env = {}) {
  return {
    dpi: Math.max(72, Number(env.OCR_DPI) || 200),
    maxPages: Math.max(1, Number(env.MAX_OCR_PAGES) || 15),
    scannedCharsPerPage: Math.max(1, Number(env.SCANNED_CHARS_PER_PAGE) || 40),
    lowConfidenceThreshold: Math.max(0, Number(env.OCR_LOW_CONFIDENCE_THRESHOLD) || 45),
    timeoutMs: Math.max(1000, Number(env.OCR_TIMEOUT_MS) || 180_000),
    maxHeapMb: Math.max(64, Number(env.OCR_MAX_HEAP_MB) || 256),
  };
}

/**
 * Build the digital-extraction isolation config. The span extractor decodes
 * every page's embedded images (getOperatorList), which can OOM the server on
 * a large image-heavy DIGITAL PDF — the same failure class OCR had, but on the
 * path OCR isolation never covered. It runs in its own killable, heap-capped
 * child process; these are its bounds. Kept pure/testable like buildOcrConfig.
 *
 * Env:
 *   EXTRACT_TIMEOUT_MS   wall-clock cap on one extraction (default: 120000).
 *                        Digital parsing is faster than OCR, so its budget is
 *                        smaller than OCR_TIMEOUT_MS.
 *   EXTRACT_MAX_HEAP_MB  V8 old-space cap for the extraction child (default:
 *                        256) — a runaway decode dies in the child, not the
 *                        server.
 */
export function buildExtractConfig(env = {}) {
  return {
    timeoutMs: Math.max(1000, Number(env.EXTRACT_TIMEOUT_MS) || 120_000),
    maxHeapMb: Math.max(64, Number(env.EXTRACT_MAX_HEAP_MB) || 256),
  };
}

/** The API key for whichever provider is currently selected (may be empty). */
export function selectedApiKey(ai) {
  return ai.provider === 'openai' ? ai.openaiKey : ai.anthropicKey;
}

/** The env var name the selected provider expects, for messages/warnings. */
export function selectedKeyName(ai) {
  return ai.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
}

export const config = {
  whatsapp: {
    token: WHATSAPP_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: WHATSAPP_VERIFY_TOKEN,
    appSecret: WHATSAPP_APP_SECRET,
    graphVersion: GRAPH_API_VERSION,
    graphBase: `https://graph.facebook.com/${GRAPH_API_VERSION}`,
  },
  ai: buildAiConfig(process.env),
  server: {
    port: Number(PORT) || 8788,
    dataDir: path.resolve(DATA_DIR),
    maxPdfBytes: (Number(MAX_PDF_MB) || 20) * 1024 * 1024,
    // Max pages of a PDF whose text layer we extract (page-bomb / CPU guard).
    maxPdfPages: Math.max(1, Number(MAX_PDF_PAGES) || 300),
    // Max tables emitted into one .xlsx (bounds output size / memory).
    maxTables: Math.max(1, Number(MAX_TABLES) || 50),
    // Hard wall-clock bound on a single DOCX/XLSX conversion.
    conversionTimeoutMs: Math.max(1000, Number(CONVERSION_TIMEOUT_MS) || 45000),
    sessionTtlMs: (Number(SESSION_TTL_MINUTES) || 60) * 60 * 1000,
    // Max inbound messages processed per sender per minute (abuse/cost guard).
    rateLimitPerMin: Math.max(1, Number(RATE_LIMIT_PER_MIN) || 20),
  },
  ocr: buildOcrConfig(process.env),
  extract: buildExtractConfig(process.env),
};

/** Warn (but don't crash) about configuration that will break requests. */
export function warnOnMissingConfig(log) {
  const missing = [];
  if (!config.whatsapp.token) missing.push('WHATSAPP_TOKEN');
  if (!config.whatsapp.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!config.whatsapp.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!selectedApiKey(config.ai)) missing.push(selectedKeyName(config.ai));

  if (missing.length) {
    log.warn(
      `Missing config: ${missing.join(', ')}. ` +
        'The server will start but related features will fail until these are set.',
    );
  }
  if (!config.whatsapp.appSecret) {
    log.warn(
      'WHATSAPP_APP_SECRET is not set — incoming webhook signatures will NOT be ' +
        'verified. Set it before exposing this server publicly.',
    );
  }
}
