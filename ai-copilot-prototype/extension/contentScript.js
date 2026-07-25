// contentScript.js
// Orchestrator. Boots the components, applies theme + settings, and routes
// messages from the background worker (keyboard commands, context menu).

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { storage, FloatingButton, TextToolbar, ChatBox, Sidebar, CommandPalette, FormFill, ui } = AICopilot;

  // Guard against double-injection (e.g. SPA re-navigation).
  if (window.__aicpBooted) return;
  window.__aicpBooted = true;

  const state = { authChecked: false, signedIn: false };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-aicp-theme', theme === 'light' ? 'light' : 'dark');
  }

  async function boot() {
    const config = await storage.getAll();
    applyTheme(config.settings.theme);

    // Mount always-available surfaces (they render lazily on first use).
    ChatBox.mount();
    Sidebar.mount();
    CommandPalette.mount();
    TextToolbar.mount();

    // Toggleable surfaces.
    if (config.settings.floatingButton) {
      FloatingButton.mount({ onClick: () => ChatBox.toggle() });
    }
    TextToolbar.setEnabled(config.settings.textToolbar);
    FormFill.mount();

    state.signedIn = Boolean(config.token);
    state.authChecked = true;
    if (!state.signedIn) {
      // Non-blocking nudge; the user signs in from the popup.
      setTimeout(
        () => ui.toast('Sign in to AI Copilot from the toolbar icon to start.', 'info'),
        1200,
      );
    }

    // React to settings changes made in the options/popup pages.
    storage.onChange((next) => {
      applyTheme(next.settings.theme);
      FloatingButton.setVisible(next.settings.floatingButton);
      if (next.settings.floatingButton && !FloatingButton.root) {
        FloatingButton.mount({ onClick: () => ChatBox.toggle() });
      }
      TextToolbar.setEnabled(next.settings.textToolbar);
      state.signedIn = Boolean(next.token);
    });
  }

  // Messages from the background worker.
  chrome.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case 'TOGGLE_COMMAND_PALETTE':
        CommandPalette.toggle();
        break;
      case 'TOGGLE_SIDEBAR':
        Sidebar.toggle();
        break;
      case 'ASK_SELECTION':
        ChatBox.openWith(message.text || '');
        break;
      default:
        break;
    }
  });

  // Global hotkey fallback (works even if chrome.commands isn't wired on the page).
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      CommandPalette.toggle();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
