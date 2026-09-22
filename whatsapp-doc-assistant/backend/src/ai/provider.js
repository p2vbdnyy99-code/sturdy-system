// The AI provider contract.
// -----------------------------------------------------------------------------
// Every provider (OpenAI, Anthropic, …) implements a single low-level method:
//   complete({ system, user, maxTokens }) -> Promise<string>
// It turns a system + user prompt into plain text. All higher-level operations
// (summarize, answer, translate, …) are built on top of this in ai/index.js, so
// the prompts stay provider-independent and only the transport differs.

export class AIProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Run a single-turn completion and return the text output.
   *
   * `reasoningEffort` is a provider-agnostic hint ('none' | 'minimal' | 'low' |
   * 'medium' | 'high' | …). A provider honors it if its model supports reasoning
   * and ignores it otherwise. It lets callers ask a reasoning model to spend
   * little effort on simple tasks (e.g. intent classification).
   *
   * @param {{ system?: string, user: string, maxTokens?: number, reasoningEffort?: string }} _args
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async complete(_args) {
    throw new Error(`${this.name}: complete() is not implemented`);
  }
}
