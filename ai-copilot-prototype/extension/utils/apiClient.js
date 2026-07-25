// utils/apiClient.js
// Content-script-side client. It does NOT talk to the network directly; instead
// it forwards requests to the background service worker (which owns retry logic,
// the auth token, and the streaming connection to the backend).

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background worker.'));
          return;
        }
        if (response.error) {
          reject(Object.assign(new Error(response.error), { status: response.status }));
          return;
        }
        resolve(response.data);
      });
    });
  }

  const api = {
    // ── Auth ────────────────────────────────────────────────────────────────
    register: (email, password) => sendMessage({ type: 'AUTH_REGISTER', email, password }),
    login: (email, password) => sendMessage({ type: 'AUTH_LOGIN', email, password }),
    logout: () => sendMessage({ type: 'AUTH_LOGOUT' }),
    me: () => sendMessage({ type: 'AUTH_ME' }),
    credits: () => sendMessage({ type: 'CREDITS' }),

    // ── Buffered completion ──────────────────────────────────────────────────
    complete: (payload) => sendMessage({ type: 'AI_COMPLETE', payload }),

    /**
     * Streaming completion. Returns an object with an `abort()` method.
     * Callbacks: onDelta(textChunk), onDone(summary), onError(message).
     */
    stream(payload, { onDelta, onDone, onError } = {}) {
      const port = chrome.runtime.connect({ name: 'ai-stream' });
      let finished = false;

      port.onMessage.addListener((msg) => {
        if (msg.type === 'delta') onDelta?.(msg.text);
        else if (msg.type === 'done') {
          finished = true;
          onDone?.(msg);
          port.disconnect();
        } else if (msg.type === 'error') {
          finished = true;
          onError?.(msg.error);
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (!finished) onError?.('Stream disconnected.');
      });

      port.postMessage({ type: 'start', payload });

      return {
        abort() {
          if (!finished) {
            finished = true;
            port.disconnect();
          }
        },
      };
    },
  };

  AICopilot.api = api;
})();
