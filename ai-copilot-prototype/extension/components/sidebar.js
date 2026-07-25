// components/sidebar.js
// A slide-in panel docked to the right edge for page-level tasks: summarize the
// page, pull key points, or answer questions grounded in the visible content.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { ui, api, prompts } = AICopilot;

  const Sidebar = {
    root: null,
    bodyEl: null,
    open: false,
    streaming: null,

    mount() {
      if (this.root) return;
      this.root = ui.el('div', { class: 'aicp-sidebar' });
      this.root.innerHTML = `
        <div class="aicp-sidebar__header">
          <div class="aicp-chat__title"><span class="aicp-chat__spark">✦</span> Copilot Sidebar</div>
          <button class="aicp-chat__icon-btn" data-action="close" title="Close">✕</button>
        </div>
        <div class="aicp-sidebar__tools">
          <button class="aicp-sidebar__tool" data-tool="summary">📄 Summarize page</button>
          <button class="aicp-sidebar__tool" data-tool="keypoints">🔑 Key points</button>
          <button class="aicp-sidebar__tool" data-tool="questions">❓ Questions to ask</button>
        </div>
        <div class="aicp-sidebar__body">
          <div class="aicp-sidebar__placeholder">Pick a tool above to analyze this page.</div>
        </div>`;
      document.body.appendChild(this.root);

      this.bodyEl = this.root.querySelector('.aicp-sidebar__body');
      this.root.querySelector('[data-action="close"]').addEventListener('click', () => this.close());
      this.root.querySelectorAll('.aicp-sidebar__tool').forEach((btn) =>
        btn.addEventListener('click', () => this.runTool(btn.dataset.tool)),
      );
    },

    toggle() {
      this.open ? this.close() : this.show();
    },

    show() {
      this.mount();
      this.root.classList.add('aicp-sidebar--open');
      this.open = true;
    },

    close() {
      if (!this.root) return;
      this.root.classList.remove('aicp-sidebar--open');
      this.open = false;
      this.streaming?.abort();
    },

    /** Grab a trimmed slice of the page's visible text for grounding. */
    extractPageText(limit = 6000) {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script,style,noscript,.aicp-sidebar,.aicp-chat,.aicp-fab,.aicp-toolbar').forEach((n) => n.remove());
      const text = (clone.innerText || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      return text.slice(0, limit);
    },

    runTool(tool) {
      this.show();
      const pageText = this.extractPageText();
      if (!pageText) {
        this.bodyEl.innerHTML = '<div class="aicp-sidebar__placeholder">No readable text found on this page.</div>';
        return;
      }

      const templates = {
        summary: `Summarize the following web page content in a short paragraph, then 3–5 bullet takeaways.\n\n"""${pageText}"""`,
        keypoints: `Extract the key points from the following web page content as a concise bulleted list.\n\n"""${pageText}"""`,
        questions: `Based on the following web page content, suggest 5 insightful questions a curious reader might ask.\n\n"""${pageText}"""`,
      };

      this.bodyEl.innerHTML = '<div class="aicp-sidebar__result aicp-msg--streaming"></div>';
      const result = this.bodyEl.querySelector('.aicp-sidebar__result');
      let acc = '';

      this.streaming?.abort();
      this.streaming = api.stream(
        { system: prompts.SYSTEM_BASE, prompt: templates[tool] },
        {
          onDelta: (chunk) => {
            acc += chunk;
            result.innerHTML = ui.renderMarkdown(acc);
          },
          onDone: () => {
            this.streaming = null;
            result.classList.remove('aicp-msg--streaming');
          },
          onError: (message) => {
            this.streaming = null;
            result.classList.remove('aicp-msg--streaming');
            result.classList.add('aicp-msg--error');
            result.textContent = `⚠ ${message}`;
          },
        },
      );
    },
  };

  AICopilot.Sidebar = Sidebar;
})();
