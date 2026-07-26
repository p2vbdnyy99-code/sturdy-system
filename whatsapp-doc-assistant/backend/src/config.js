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
  ANTHROPIC_API_KEY = '',
  DEFAULT_MODEL = 'claude-opus-5',
  PORT = '8788',
  DATA_DIR = './data',
  MAX_PDF_MB = '20',
  SESSION_TTL_MINUTES = '60',
} = process.env;

export const config = {
  whatsapp: {
    token: WHATSAPP_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: WHATSAPP_VERIFY_TOKEN,
    appSecret: WHATSAPP_APP_SECRET,
    graphVersion: GRAPH_API_VERSION,
    graphBase: `https://graph.facebook.com/${GRAPH_API_VERSION}`,
  },
  ai: {
    apiKey: ANTHROPIC_API_KEY,
    model: DEFAULT_MODEL,
  },
  server: {
    port: Number(PORT) || 8788,
    dataDir: path.resolve(DATA_DIR),
    maxPdfBytes: (Number(MAX_PDF_MB) || 20) * 1024 * 1024,
    sessionTtlMs: (Number(SESSION_TTL_MINUTES) || 60) * 60 * 1000,
  },
};

/** Warn (but don't crash) about configuration that will break requests. */
export function warnOnMissingConfig(log) {
  const missing = [];
  if (!config.whatsapp.token) missing.push('WHATSAPP_TOKEN');
  if (!config.whatsapp.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!config.whatsapp.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!config.ai.apiKey) missing.push('ANTHROPIC_API_KEY');

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
