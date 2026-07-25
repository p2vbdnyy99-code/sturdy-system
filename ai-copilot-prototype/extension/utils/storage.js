// utils/storage.js
// Thin, promise-based wrapper over chrome.storage.local plus the shared config
// schema used across the extension. Everything hangs off a single global so the
// classic content-script files can share state without a module bundler.

(function () {
  const globalName = 'AICopilot';
  const AICopilot = (window[globalName] = window[globalName] || {});

  const DEFAULTS = {
    backendUrl: 'http://localhost:8787',
    token: null,
    user: null, // { id, email, credits }
    settings: {
      theme: 'dark', // 'dark' | 'light'
      floatingButton: true,
      textToolbar: true,
      model: '', // empty = let the backend choose its default
      temperatureLabel: 'balanced',
    },
  };

  function deepMerge(base, override) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const key of Object.keys(override || {})) {
      const value = override[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof out[key] === 'object') {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  const storage = {
    DEFAULTS,

    /** Read the full config object, filled in with defaults. */
    async getAll() {
      const raw = await chrome.storage.local.get('config');
      return deepMerge(DEFAULTS, raw.config || {});
    },

    /** Shallow-merge a patch into the stored config and return the result. */
    async patch(partial) {
      const current = await storage.getAll();
      const next = deepMerge(current, partial);
      await chrome.storage.local.set({ config: next });
      return next;
    },

    async get(key) {
      const all = await storage.getAll();
      return all[key];
    },

    async getToken() {
      return (await storage.getAll()).token;
    },

    async setAuth({ token, user }) {
      return storage.patch({ token: token ?? null, user: user ?? null });
    },

    async clearAuth() {
      return storage.patch({ token: null, user: null });
    },

    /** Subscribe to config changes; returns an unsubscribe function. */
    onChange(callback) {
      const handler = (changes, area) => {
        if (area === 'local' && changes.config) {
          callback(deepMerge(DEFAULTS, changes.config.newValue || {}));
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };

  AICopilot.storage = storage;
})();
