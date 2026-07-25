// options.js — reads/writes the shared config in chrome.storage.local.

const DEFAULTS = {
  backendUrl: 'http://localhost:8787',
  settings: {
    theme: 'dark',
    floatingButton: true,
    textToolbar: true,
    model: '',
  },
};

const $ = (id) => document.getElementById(id);

async function getConfig() {
  const raw = await chrome.storage.local.get('config');
  const cfg = raw.config || {};
  return {
    ...DEFAULTS,
    ...cfg,
    settings: { ...DEFAULTS.settings, ...(cfg.settings || {}) },
  };
}

function flashSaved() {
  const el = $('saved');
  el.classList.add('show');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => el.classList.remove('show'), 1200);
}

async function save() {
  const current = await getConfig();
  const next = {
    ...current,
    backendUrl: $('backendUrl').value.trim() || DEFAULTS.backendUrl,
    settings: {
      ...current.settings,
      theme: $('theme').value,
      model: $('model').value.trim(),
      floatingButton: $('floatingButton').checked,
      textToolbar: $('textToolbar').checked,
    },
  };
  await chrome.storage.local.set({ config: next });
  flashSaved();
}

async function load() {
  const cfg = await getConfig();
  $('backendUrl').value = cfg.backendUrl;
  $('theme').value = cfg.settings.theme;
  $('model').value = cfg.settings.model;
  $('floatingButton').checked = cfg.settings.floatingButton;
  $('textToolbar').checked = cfg.settings.textToolbar;
}

['backendUrl', 'model'].forEach((id) => $(id).addEventListener('change', save));
['theme'].forEach((id) => $(id).addEventListener('change', save));
['floatingButton', 'textToolbar'].forEach((id) => $(id).addEventListener('change', save));

load();
