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

  async complete({ system, user, maxTokens = 1500, reasoningEffort }) {
    const start = Date.now();
    try {
      const res = await this.client.responses.create({
        model: this.model,
        ...(system ? { instructions: system } : {}),
        input: user,
        max_output_tokens: maxTokens,
        // Reasoning models bill "thinking" tokens against max_output_tokens.
        // When a caller asks for a specific effort (e.g. 'minimal' for simple
        // classification), pass it through so reasoning doesn't crowd out the
        // visible answer. Omitted → the model's default effort.
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      });
      // Purely observational — never changes complete()'s return shape, so
      // every existing caller (Papyr's summarize/translate/... and BidPilot's
      // extract/eligibility) is unaffected. Real usage from the API response,
      // not an estimate — used for the performance/cost audit in
      // BIDPILOT_ARCHITECTURE.md's Milestone "Beta Readiness" section.
      if (res.usage) {
        log.info(
          `metric ai_call provider=openai model=${this.model} ` +
            `input_tokens=${res.usage.input_tokens} output_tokens=${res.usage.output_tokens} ` +
            `total_tokens=${res.usage.total_tokens} ms=${Date.now() - start}`,
        );
      }
      return (res.output_text || '').trim();
    } catch (err) {
      throw mapProviderError(err, 'OpenAI');
    }
  }
}
