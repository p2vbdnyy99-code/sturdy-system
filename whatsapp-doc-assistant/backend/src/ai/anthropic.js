// Anthropic provider.
// -----------------------------------------------------------------------------
// Implements the AIProvider contract using the `@anthropic-ai/sdk` Messages API.
// This is the only file in the project that imports the Anthropic SDK — the
// behavior here is preserved verbatim from the original src/ai.js.

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider } from './provider.js';
import { AIError, mapProviderError } from './errors.js';

export class AnthropicProvider extends AIProvider {
  constructor({ apiKey, model, timeoutMs = 60_000 }) {
    super('anthropic');
    if (!apiKey) {
      throw new AIError(
        'not_configured',
        'Anthropic is selected (AI_PROVIDER=anthropic) but ANTHROPIC_API_KEY is not set.',
      );
    }
    this.model = model;
    this.client = new Anthropic({ apiKey, timeout: timeoutMs });
  }

  async complete({ system, user, maxTokens = 1500 }) {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: user }],
      });
      return message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } catch (err) {
      throw mapProviderError(err, 'Anthropic');
    }
  }
}
