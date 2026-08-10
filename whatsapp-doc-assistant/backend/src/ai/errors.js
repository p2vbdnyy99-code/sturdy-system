// Provider-independent AI errors.
// -----------------------------------------------------------------------------
// Providers throw `AIError`s with a stable `code`. The router turns an AIError
// into a short, user-safe message via `userMessage` — raw SDK errors, stack
// traces, and API keys never reach the WhatsApp user.

export const AI_ERROR_CODES = {
  NOT_CONFIGURED: 'not_configured',
  INVALID_KEY: 'invalid_key',
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  MODEL_UNAVAILABLE: 'model_unavailable',
  PROVIDER_ERROR: 'provider_error',
  TOO_LARGE: 'too_large',
};

// Short, understandable messages for the WhatsApp user. No provider names, no
// internal detail — those go to the server log instead.
const USER_MESSAGES = {
  not_configured: 'The AI service is not set up on the server yet. Please try again later.',
  invalid_key: 'The AI service rejected our credentials. The team has been notified.',
  rate_limit: 'The AI service is busy right now — please try again in a moment.',
  timeout: 'That took too long to process. Please try again.',
  model_unavailable: 'The configured AI model is currently unavailable. Please try again later.',
  provider_error: 'The AI service is temporarily unavailable. Please try again shortly.',
  too_large: 'That document is too large for me to process right now.',
};

export class AIError extends Error {
  constructor(code, message, { cause, status } = {}) {
    super(message || code);
    this.name = 'AIError';
    this.code = code;
    if (cause) this.cause = cause;
    if (status !== undefined) this.status = status;
  }

  /** A short, safe message suitable for sending to the end user. */
  get userMessage() {
    return USER_MESSAGES[this.code] || 'Sorry, the AI service had a problem. Please try again.';
  }
}

/**
 * Normalize an SDK / network error into an AIError. Both the OpenAI and
 * Anthropic SDKs expose an HTTP `status` on their error objects, so one mapping
 * serves both. `provider` is only used for the server-side message.
 */
export function mapProviderError(err, provider = 'AI') {
  if (err instanceof AIError) return err;

  const status = err?.status ?? err?.statusCode;
  const name = err?.name || '';
  const msg = String(err?.message || err || '');

  if (name === 'AbortError' || /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) {
    return new AIError('timeout', `${provider} request timed out`, { cause: err, status });
  }
  if (status === 401 || status === 403) {
    return new AIError('invalid_key', `${provider} authentication failed`, { cause: err, status });
  }
  if (status === 429) {
    return new AIError('rate_limit', `${provider} rate limit exceeded`, { cause: err, status });
  }
  if (status === 404) {
    return new AIError('model_unavailable', `${provider} model not found`, { cause: err, status });
  }
  if (status === 413) {
    return new AIError('too_large', `${provider} request too large`, { cause: err, status });
  }
  if (typeof status === 'number' && status >= 500) {
    return new AIError('provider_error', `${provider} server error (${status})`, { cause: err, status });
  }
  return new AIError('provider_error', `${provider} error: ${msg}`, { cause: err, status });
}
