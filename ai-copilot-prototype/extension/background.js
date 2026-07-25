// background.js  (MV3 service worker, ES module)
// -----------------------------------------------------------------------------
// The single place that touches the network. It owns the auth token, applies
// retry-with-backoff to transient failures, and bridges the backend's SSE
// stream to content-script ports. Content scripts never fetch directly.

const DEFAULTS = {
  backendUrl: 'http://localhost:8787',
  token: null,
  user: null,
  settings: {
    theme: 'dark',
    floatingButton: true,
    textToolbar: true,
    model: '',
    temperatureLabel: 'balanced',
  },
};

// ─── Config helpers (chrome.storage.local, no window in a worker) ─────────────

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

async function getConfig() {
  const raw = await chrome.storage.local.get('config');
  return deepMerge(DEFAULTS, raw.config || {});
}

async function patchConfig(partial) {
  const next = deepMerge(await getConfig(), partial);
  await chrome.storage.local.set({ config: next });
  return next;
}

// ─── Fetch with exponential backoff ──────────────────────────────────────────

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const BACKOFFS_MS = [2000, 4000, 8000, 16000];

async function fetchWithRetry(url, options, { retries = 4 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await delay(BACKOFFS_MS[attempt] ?? 16000);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await delay(BACKOFFS_MS[attempt] ?? 16000);
        continue;
      }
    }
  }
  throw lastError || new Error('Network request failed.');
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Backend request helpers ─────────────────────────────────────────────────

async function apiFetch(pathname, { method = 'GET', body, auth = true } = {}) {
  const config = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (auth && config.token) headers.Authorization = `Bearer ${config.token}`;

  const res = await fetchWithRetry(`${config.backendUrl}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Malformed response.' };
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    if (res.status === 401 && auth) await patchConfig({ token: null, user: null });
    throw err;
  }
  return data;
}

/** Merge the extension's configured model into an AI payload. */
async function withModel(payload) {
  const { settings } = await getConfig();
  const out = { ...payload };
  if (settings.model && !out.model) out.model = settings.model;
  return out;
}

// ─── Message router (buffered requests) ──────────────────────────────────────

const handlers = {
  async AUTH_REGISTER({ email, password }) {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: { email, password }, auth: false });
    await patchConfig({ token: data.token, user: data.user });
    return data;
  },

  async AUTH_LOGIN({ email, password }) {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
    await patchConfig({ token: data.token, user: data.user });
    return data;
  },

  async AUTH_LOGOUT() {
    await patchConfig({ token: null, user: null });
    return { ok: true };
  },

  async AUTH_ME() {
    const data = await apiFetch('/api/auth/me');
    await patchConfig({ user: data.user });
    return data;
  },

  async CREDITS() {
    return apiFetch('/api/credits');
  },

  async AI_COMPLETE({ payload }) {
    const data = await apiFetch('/api/ai/complete', { method: 'POST', body: await withModel(payload) });
    if (typeof data.credits === 'number') {
      const cfg = await getConfig();
      if (cfg.user) await patchConfig({ user: { ...cfg.user, credits: data.credits } });
    }
    return data;
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ error: `Unknown message type: ${message?.type}` });
    return false;
  }
  handler(message)
    .then((data) => sendResponse({ data }))
    .catch((err) => sendResponse({ error: err.message, status: err.status }));
  return true; // keep the channel open for the async response
});

// ─── Streaming port ──────────────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;

  const abort = new AbortController();
  port.onDisconnect.addListener(() => abort.abort());

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'start') return;
    try {
      await streamCompletion(await withModel(msg.payload), port, abort.signal);
    } catch (err) {
      safePost(port, { type: 'error', error: err.message || 'Stream failed.' });
    }
  });
});

function safePost(port, msg) {
  try {
    port.postMessage(msg);
  } catch {
    /* port already closed */
  }
}

async function streamCompletion(payload, port, signal) {
  const config = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  // Streaming responses are not safe to blindly retry (they may have already
  // charged and emitted tokens), so only the initial connection is attempted.
  const res = await fetch(`${config.backendUrl}/api/ai/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let error = `Stream failed (${res.status}).`;
    try {
      error = JSON.parse(text).error || error;
    } catch {
      /* keep default */
    }
    safePost(port, { type: 'error', error });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      dispatchSSE(rawEvent, port);
    }
  }
}

function dispatchSSE(rawEvent, port) {
  let event = 'message';
  let dataLine = '';
  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return;

  let data;
  try {
    data = JSON.parse(dataLine);
  } catch {
    return;
  }

  if (event === 'delta') safePost(port, { type: 'delta', text: data.text });
  else if (event === 'done') {
    if (typeof data.credits === 'number') {
      getConfig().then((cfg) => {
        if (cfg.user) patchConfig({ user: { ...cfg.user, credits: data.credits } });
      });
    }
    safePost(port, { type: 'done', ...data });
  } else if (event === 'error') safePost(port, { type: 'error', error: data.error });
}

// ─── Commands + context menu ─────────────────────────────────────────────────

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const map = {
    'toggle-command-palette': 'TOGGLE_COMMAND_PALETTE',
    'toggle-sidebar': 'TOGGLE_SIDEBAR',
  };
  if (map[command]) chrome.tabs.sendMessage(tab.id, { type: map[command] }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: 'ai-copilot-ask',
    title: 'Ask AI Copilot about "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-copilot-ask' && tab?.id) {
    chrome.tabs
      .sendMessage(tab.id, { type: 'ASK_SELECTION', text: info.selectionText || '' })
      .catch(() => {});
  }
});
