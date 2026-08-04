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
  OCR_DPI = '200',
  MAX_OCR_PAGES = '15',
  SCANNED_CHARS_PER_PAGE = '40',
  OCR_LOW_CONFIDENCE_THRESHOLD = '45',
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
  ocr: {
    // Rasterization resolution for pages sent to Tesseract (higher = more
    // accurate, slower). 200 is a reasonable accuracy/CPU tradeoff.
    dpi: Math.max(72, Number(OCR_DPI) || 200),
    // Cap OCR work so a huge scan can't stall the bot.
    maxPages: Math.max(1, Number(MAX_OCR_PAGES) || 15),
    // Below this many characters of real text, a PAGE (not the whole document)
    // is treated as scanned — supports mixed digital/scanned documents.
    scannedCharsPerPage: Math.max(1, Number(SCANNED_CHARS_PER_PAGE) || 40),
    // Below this average Tesseract word confidence (0-100), OCR text is kept
    // but flagged low-confidence so the caller can warn the user rather than
    // silently reconstruct a document from guesses (hard rule: never fabricate).
    lowConfidenceThreshold: Math.max(0, Number(OCR_LOW_CONFIDENCE_THRESHOLD) || 45),
  },
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
