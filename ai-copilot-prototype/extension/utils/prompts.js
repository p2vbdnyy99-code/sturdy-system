// utils/prompts.js
// Reusable prompt templates and quick-action definitions. Keeping these in one
// place makes it easy to tune the copilot's behavior without touching UI code.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});

  const SYSTEM_BASE =
    'You are AI Copilot, a concise, helpful writing and research assistant embedded in the ' +
    "user's browser. Prefer clear, direct answers. When editing text, return only the edited " +
    'text with no preamble unless the user asks for an explanation.';

  /** Quick actions shown in the text toolbar and command palette. */
  const QUICK_ACTIONS = [
    {
      id: 'improve',
      label: 'Improve writing',
      icon: '✨',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Improve the clarity, grammar, and flow of the following text. Keep the meaning and tone. Return only the improved text.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'shorten',
      label: 'Make shorter',
      icon: '✂️',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Rewrite the following text to be significantly shorter while preserving the key points. Return only the shortened text.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'expand',
      label: 'Expand',
      icon: '➕',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Expand the following text with more detail and helpful context. Return only the expanded text.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'summarize',
      label: 'Summarize',
      icon: '📝',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Summarize the following text into a few tight bullet points.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'fix',
      label: 'Fix spelling & grammar',
      icon: '🩹',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Fix any spelling and grammar mistakes in the following text. Change nothing else. Return only the corrected text.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'translate',
      label: 'Translate to English',
      icon: '🌐',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Translate the following text to natural English. Return only the translation.\n\n"""${text}"""`,
      }),
    },
    {
      id: 'explain',
      label: 'Explain this',
      icon: '💡',
      build: (text) => ({
        system: SYSTEM_BASE,
        prompt: `Explain the following text or concept simply and clearly.\n\n"""${text}"""`,
      }),
    },
  ];

  const prompts = {
    SYSTEM_BASE,
    QUICK_ACTIONS,

    getAction(id) {
      return QUICK_ACTIONS.find((a) => a.id === id) || null;
    },

    /** Build a chat request from a free-form user message and page context. */
    chat(message, { pageContext } = {}) {
      let system = SYSTEM_BASE;
      if (pageContext) {
        system +=
          `\n\nThe user is on the page titled "${pageContext.title}" (${pageContext.url}). ` +
          'Use this context only if relevant to their question.';
      }
      return { system, prompt: message };
    },

    /** Build a request that suggests a value for a form field. */
    formField({ label, type, context }) {
      return {
        system:
          SYSTEM_BASE +
          ' You are helping fill a web form. Respond with only the suggested field value, no quotes or explanation.',
        prompt:
          `Suggest a realistic, appropriate value for a form field.\n` +
          `Field label: ${label || '(none)'}\n` +
          `Field type: ${type || 'text'}\n` +
          (context ? `Page context: ${context}\n` : '') +
          `Return only the value.`,
      };
    },
  };

  AICopilot.prompts = prompts;
})();
