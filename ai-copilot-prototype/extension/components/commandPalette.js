// components/commandPalette.js
// A spotlight-style command palette (Ctrl/Cmd+Shift+K). Filter commands as you
// type; Enter runs the highlighted one. Free text with no match opens the chat
// pre-filled with what you typed.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { ui } = AICopilot;

  const CommandPalette = {
    root: null,
    inputEl: null,
    listEl: null,
    open: false,
    commands: [],
    filtered: [],
    activeIndex: 0,

    buildCommands() {
      const base = [
        { id: 'chat', icon: '💬', label: 'Open chat', run: () => AICopilot.ChatBox.show() },
        { id: 'sidebar', icon: '📑', label: 'Toggle sidebar', run: () => AICopilot.Sidebar.toggle() },
        { id: 'summarize', icon: '📄', label: 'Summarize this page', run: () => AICopilot.Sidebar.runTool('summary') },
        { id: 'keypoints', icon: '🔑', label: 'Key points of this page', run: () => AICopilot.Sidebar.runTool('keypoints') },
      ];
      // Quick actions operate on the current selection if there is one.
      const actionCommands = AICopilot.prompts.QUICK_ACTIONS.map((a) => ({
        id: `qa-${a.id}`,
        icon: a.icon,
        label: `${a.label} (selection)`,
        run: () => {
          const text = window.getSelection()?.toString().trim();
          if (!text) {
            ui.toast('Select some text first.', 'error');
            return;
          }
          AICopilot.TextToolbar.currentSelection = {
            text,
            range: window.getSelection().getRangeAt(0),
            target: AICopilot.TextToolbar.resolveEditable(),
          };
          AICopilot.TextToolbar.runAction(a);
        },
      }));
      this.commands = [...base, ...actionCommands];
    },

    mount() {
      if (this.root) return;
      this.buildCommands();
      this.root = ui.el('div', { class: 'aicp-palette', style: { display: 'none' } });
      this.root.innerHTML = `
        <div class="aicp-palette__panel">
          <input class="aicp-palette__input" type="text" placeholder="Type a command or a question…" />
          <div class="aicp-palette__list"></div>
          <div class="aicp-palette__hint">↑↓ to navigate · Enter to run · Esc to close</div>
        </div>`;
      document.body.appendChild(this.root);

      this.inputEl = this.root.querySelector('.aicp-palette__input');
      this.listEl = this.root.querySelector('.aicp-palette__list');

      this.root.addEventListener('mousedown', (e) => {
        if (e.target === this.root) this.close();
      });
      this.inputEl.addEventListener('input', () => this.filter());
      this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));
    },

    toggle() {
      this.open ? this.close() : this.show();
    },

    show() {
      this.mount();
      this.root.style.display = 'flex';
      this.open = true;
      this.inputEl.value = '';
      this.filter();
      requestAnimationFrame(() => this.inputEl.focus());
    },

    close() {
      if (!this.root) return;
      this.root.style.display = 'none';
      this.open = false;
    },

    filter() {
      const q = this.inputEl.value.trim().toLowerCase();
      this.filtered = q
        ? this.commands.filter((c) => c.label.toLowerCase().includes(q))
        : this.commands.slice();
      this.activeIndex = 0;
      this.renderList(q);
    },

    renderList(query) {
      this.listEl.innerHTML = '';
      if (this.filtered.length === 0) {
        this.listEl.appendChild(
          ui.el('div', { class: 'aicp-palette__row aicp-palette__row--ask', onclick: () => this.askFreeform() }, [
            ui.el('span', { class: 'aicp-palette__icon', text: '✦' }),
            `Ask AI: "${query}"`,
          ]),
        );
        return;
      }
      this.filtered.forEach((cmd, i) => {
        const row = ui.el(
          'div',
          {
            class: `aicp-palette__row${i === this.activeIndex ? ' aicp-palette__row--active' : ''}`,
            onmouseenter: () => {
              this.activeIndex = i;
              this.highlight();
            },
            onclick: () => this.execute(cmd),
          },
          [ui.el('span', { class: 'aicp-palette__icon', text: cmd.icon }), cmd.label],
        );
        this.listEl.appendChild(row);
      });
    },

    highlight() {
      [...this.listEl.children].forEach((row, i) =>
        row.classList.toggle('aicp-palette__row--active', i === this.activeIndex),
      );
    },

    onKeydown(e) {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = Math.min(this.activeIndex + 1, Math.max(0, this.filtered.length - 1));
        this.highlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = Math.max(this.activeIndex - 1, 0);
        this.highlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.filtered.length === 0) this.askFreeform();
        else this.execute(this.filtered[this.activeIndex]);
      }
    },

    askFreeform() {
      const text = this.inputEl.value.trim();
      this.close();
      AICopilot.ChatBox.openWith(text);
    },

    execute(cmd) {
      this.close();
      try {
        cmd.run();
      } catch (err) {
        ui.toast(err.message || 'Command failed.', 'error');
      }
    },
  };

  AICopilot.CommandPalette = CommandPalette;
})();
