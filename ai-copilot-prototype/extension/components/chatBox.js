// components/chatBox.js
// The floating conversational panel. Streams responses token-by-token, keeps an
// in-memory transcript, and can optionally pass page context to the model.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { ui, prompts, api } = AICopilot;

  const ChatBox = {
    root: null,
    messagesEl: null,
    inputEl: null,
    creditsEl: null,
    open: false,
    streaming: null,
    history: [], // { role, content }
    usePageContext: false,

    mount() {
      if (this.root) return;
      this.root = ui.el('div', { class: 'aicp-chat', style: { display: 'none' } });
      this.root.innerHTML = `
        <div class="aicp-chat__header">
          <div class="aicp-chat__title"><span class="aicp-chat__spark">✦</span> AI Copilot</div>
          <div class="aicp-chat__meta">
            <span class="aicp-chat__credits" title="Remaining credits">—</span>
            <button class="aicp-chat__icon-btn" data-action="context" title="Include page context">🌐</button>
            <button class="aicp-chat__icon-btn" data-action="clear" title="Clear conversation">🗑️</button>
            <button class="aicp-chat__icon-btn" data-action="close" title="Close">✕</button>
          </div>
        </div>
        <div class="aicp-chat__messages"></div>
        <form class="aicp-chat__composer">
          <textarea class="aicp-chat__input" rows="1" placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"></textarea>
          <button type="submit" class="aicp-chat__send" title="Send">➤</button>
        </form>`;
      document.body.appendChild(this.root);

      this.messagesEl = this.root.querySelector('.aicp-chat__messages');
      this.inputEl = this.root.querySelector('.aicp-chat__input');
      this.creditsEl = this.root.querySelector('.aicp-chat__credits');

      this.root.querySelector('[data-action="close"]').addEventListener('click', () => this.close());
      this.root.querySelector('[data-action="clear"]').addEventListener('click', () => this.clear());
      const ctxBtn = this.root.querySelector('[data-action="context"]');
      ctxBtn.addEventListener('click', () => {
        this.usePageContext = !this.usePageContext;
        ctxBtn.classList.toggle('aicp-chat__icon-btn--on', this.usePageContext);
        ui.toast(this.usePageContext ? 'Page context on' : 'Page context off');
      });

      this.root.querySelector('.aicp-chat__composer').addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit();
      });

      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submit();
        }
      });
      this.inputEl.addEventListener('input', () => this.autoGrow());

      if (this.history.length === 0) this.renderEmptyState();
      this.refreshCredits();
    },

    renderEmptyState() {
      this.messagesEl.innerHTML = `
        <div class="aicp-chat__empty">
          <div class="aicp-chat__empty-spark">✦</div>
          <p>Ask a question, or highlight text on the page and pick an action.</p>
        </div>`;
    },

    autoGrow() {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = `${Math.min(160, this.inputEl.scrollHeight)}px`;
    },

    async refreshCredits() {
      try {
        const { credits } = await api.credits();
        if (this.creditsEl) this.creditsEl.textContent = `${credits} cr`;
      } catch {
        if (this.creditsEl) this.creditsEl.textContent = '—';
      }
    },

    toggle() {
      this.open ? this.close() : this.show();
    },

    show() {
      this.mount();
      this.root.style.display = 'flex';
      this.open = true;
      requestAnimationFrame(() => this.root.classList.add('aicp-chat--in'));
      this.inputEl.focus();
      this.refreshCredits();
    },

    close() {
      if (!this.root) return;
      this.root.classList.remove('aicp-chat--in');
      this.open = false;
      this.streaming?.abort();
      setTimeout(() => {
        if (!this.open) this.root.style.display = 'none';
      }, 200);
    },

    openWith(text) {
      this.show();
      if (text) {
        this.inputEl.value = text.length > 800 ? text.slice(0, 800) + '…' : text;
        this.autoGrow();
        this.inputEl.focus();
      }
    },

    showResult(source, result) {
      this.show();
      this.appendMessage('user', source);
      this.appendMessage('assistant', result);
    },

    clear() {
      this.history = [];
      this.streaming?.abort();
      this.renderEmptyState();
    },

    appendMessage(role, content) {
      if (this.messagesEl.querySelector('.aicp-chat__empty')) this.messagesEl.innerHTML = '';
      const bubble = ui.el('div', { class: `aicp-msg aicp-msg--${role}` });
      bubble.innerHTML =
        role === 'assistant' ? ui.renderMarkdown(content) : ui.escapeHtml(content);
      this.messagesEl.appendChild(bubble);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      return bubble;
    },

    submit() {
      const text = this.inputEl.value.trim();
      if (!text || this.streaming) return;
      this.inputEl.value = '';
      this.autoGrow();
      this.send(text);
    },

    send(text) {
      this.appendMessage('user', text);
      this.history.push({ role: 'user', content: text });

      const pageContext = this.usePageContext
        ? { title: document.title, url: location.href }
        : null;
      const { system } = prompts.chat(text, { pageContext });

      const bubble = this.appendMessage('assistant', '');
      bubble.classList.add('aicp-msg--streaming');
      let acc = '';

      this.streaming = api.stream(
        { system, messages: this.history },
        {
          onDelta: (chunk) => {
            acc += chunk;
            bubble.innerHTML = ui.renderMarkdown(acc);
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
          },
          onDone: (summary) => {
            this.streaming = null;
            bubble.classList.remove('aicp-msg--streaming');
            this.history.push({ role: 'assistant', content: acc });
            if (typeof summary?.credits === 'number' && this.creditsEl) {
              this.creditsEl.textContent = `${summary.credits} cr`;
            }
          },
          onError: (message) => {
            this.streaming = null;
            bubble.classList.remove('aicp-msg--streaming');
            bubble.classList.add('aicp-msg--error');
            bubble.textContent = `⚠ ${message}`;
          },
        },
      );
    },
  };

  AICopilot.ChatBox = ChatBox;
})();
