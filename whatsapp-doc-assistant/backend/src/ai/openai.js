// OpenAI provider.
// -----------------------------------------------------------------------------
// Implements the AIProvider contract using the official `openai` SDK's Responses
// API (the current recommended interface). Only this file knows about OpenAI.

import OpenAI from 'openai';
import { AIProvider } from './provider.js';
import { AIError, mapProviderError } from './errors.js';
import { log } from '../logger.js';

export class OpenAIProvider extends AIProvider {
  constructor({ apiKey, model, timeoutMs = 60_000 }) {
    super('openai');
    if (!apiKey) {
      throw new AIError(
        'not_configured',
        'OpenAI is selected (AI_PROVIDER=openai) but OPENAI_API_KEY is not set.',
      );
    }
    this.model = model;
    // The SDK enforces the timeout and aborts the request, so a call can't hang
    // forever. We keep the SDK's built-in retry default (no elaborate retry).
    this.client = new OpenAI({ apiKey, timeout: timeoutMs });
  }

  /**
   * @param {number} [timeoutMs] per-call override of the client-wide timeout,
   *   for callers whose outputs are legitimately long (tender extraction).
   * @param {number} [maxRetries] per-call override of the SDK's retry count.
   * @param {{ timeoutMs: number }} [flex] run on OpenAI's Flex tier (same
   *   model, half price, slower and sometimes out of capacity). The Flex
   *   attempt gets `flex.timeoutMs` and no SDK retries; if it fails for any
   *   reason except exhausted credit or bad credentials, the call is repeated
   *   once on the standard tier with the caller's own timeout/retries.
   */
  async complete({ system, user, maxTokens = 1500, reasoningEffort, timeoutMs, maxRetries, flex }) {
    const start = Date.now();
    const requestOptions = {
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
    };
    const body = {
      model: this.model,
      ...(system ? { instructions: system } : {}),
      input: user,
      max_output_tokens: maxTokens,
      // Reasoning models bill "thinking" tokens against max_output_tokens.
      // When a caller asks for a specific effort (e.g. 'minimal' for simple
      // classification), pass it through so reasoning doesn't crowd out the
      // visible answer. Omitted → the model's default effort.
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    };
    try {
      let res;
      let tier = 'default';
      if (flex) {
        try {
          res = await this.client.responses.create(
            { ...body, service_tier: 'flex' },
            { timeout: flex.timeoutMs, maxRetries: 0 },
          );
          tier = 'flex';
        } catch (err) {
          if (!shouldFallBackFromFlex(err)) throw err;
          log.warn(
            `metric ai_flex_fallback provider=openai model=${this.model} ` +
              `reason=${err?.status ?? err?.name ?? 'error'} after_ms=${Date.now() - start}`,
          );
        }
      }
      if (!res) res = await this.client.responses.create(body, requestOptions);
      // Purely observational — never changes complete()'s return shape, so
      // every existing caller (Papyr's summarize/translate/... and BidPilot's
      // extract/eligibility) is unaffected. Real usage from the API response,
      // not an estimate — used for the performance/cost audit in
      // BIDPILOT_ARCHITECTURE.md's Milestone "Beta Readiness" section.
      if (res.usage) {
        log.info(
          `metric ai_call provider=openai model=${this.model} ` +
            `input_tokens=${res.usage.input_tokens} output_tokens=${res.usage.output_tokens} ` +
            `total_tokens=${res.usage.total_tokens} tier=${res.service_tier ?? tier} ms=${Date.now() - start}`,
        );
      }
      return (res.output_text || '').trim();
    } catch (err) {
      throw mapProviderError(err, 'OpenAI');
    }
  }
}

// Flex capacity shortfalls come back as 429 "Resource Unavailable" (not
// billed). Anything else that goes wrong on Flex (a timeout, a 5xx, or the
// model refusing service_tier=flex with a 400) also gets one standard-tier
// attempt, so turning Flex on can never make an analysis fail that standard
// would have completed. Exhausted credit and bad credentials are the
// exceptions: the standard tier would fail identically.
function shouldFallBackFromFlex(err) {
  const code = err?.code ?? err?.error?.code;
  if (code === 'insufficient_quota') return false;
  return err?.status !== 401 && err?.status !== 403;
}
