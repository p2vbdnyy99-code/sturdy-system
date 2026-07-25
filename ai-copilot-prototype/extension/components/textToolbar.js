// components/textToolbar.js
// A Notion-style floating toolbar that appears above a text selection and
// offers quick AI actions (improve, shorten, summarize, ...). Results replace
// the selection in editable fields, or are copied to the clipboard otherwise.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { ui, prompts, api } = AICopilot;

  const TextToolbar = {
    root: null,
    enabled: true,
    currentSelection: null,

    mount() {
      if (this.root) return;
      this.root = ui.el('div', { class: 'aicp-toolbar', style: { display: 'none' } });
      document.body.appendChild(this.root);

      document.addEventListener('mouseup', (e) => this.onSelectionChange(e));
      document.addEventListener('keyup', (e) => {
        if (e.shiftKey || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          this.onSelectionChange(e);
        }
      });
      document.addEventListener('mousedown', (e) => {
        if (this.root && !this.root.contains(e.target)) this.hide();
      });
      window.addEventListener('scroll', () => this.hide(), true);
    },

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.hide();
    },

    onSelectionChange() {
      if (!this.enabled) return;
      // Defer so the selection is finalized.
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (!text || text.length < 2 || (this.root && this.root.contains(document.activeElement))) {
          this.hide();
          return;
        }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        this.currentSelection = { text, range, target: this.resolveEditable() };
        this.render();
        this.position(rect);
      }, 10);
    },

    /** If the selection lives in an editable field, return it for replacement. */
    resolveEditable() {
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /text|search|email|url/.test(active.type)))) {
        return { kind: 'input', node: active };
      }
      const anchor = window.getSelection()?.anchorNode;
      let node = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
      while (node) {
        if (node.isContentEditable) return { kind: 'contenteditable', node };
        node = node.parentElement;
      }
      return null;
    },

    render() {
      this.root.innerHTML = '';
      const buttons = prompts.QUICK_ACTIONS.slice(0, 5).map((action) =>
        ui.el(
          'button',
          {
            class: 'aicp-toolbar__btn',
            title: action.label,
            onclick: () => this.runAction(action),
          },
          [ui.el('span', { class: 'aicp-toolbar__icon', text: action.icon }), action.label],
        ),
      );
      buttons.push(
        ui.el(
          'button',
          { class: 'aicp-toolbar__btn aicp-toolbar__btn--accent', title: 'Ask AI', onclick: () => this.askInChat() },
          [ui.el('span', { class: 'aicp-toolbar__icon', text: '✦' }), 'Ask AI'],
        ),
      );
      this.root.append(...buttons);
    },

    position(rect) {
      this.root.style.display = 'flex';
      const top = window.scrollY + rect.top - this.root.offsetHeight - 10;
      const left = window.scrollX + rect.left;
      this.root.style.top = `${Math.max(window.scrollY + 8, top)}px`;
      this.root.style.left = `${Math.max(8, left)}px`;
    },

    hide() {
      if (this.root) this.root.style.display = 'none';
    },

    async runAction(action) {
      const selection = this.currentSelection;
      if (!selection) return;
      this.hide();
      const { system, prompt } = action.build(selection.text);
      ui.toast(`${action.icon} ${action.label}…`);
      try {
        const { text } = await api.complete({ system, prompt });
        this.applyResult(selection, text.trim());
      } catch (err) {
        ui.toast(err.message || 'AI request failed.', 'error');
      }
    },

    applyResult(selection, result) {
      const target = selection.target;
      if (target?.kind === 'input') {
        const node = target.node;
        const start = node.selectionStart ?? 0;
        const end = node.selectionEnd ?? node.value.length;
        node.value = node.value.slice(0, start) + result + node.value.slice(end);
        node.dispatchEvent(new Event('input', { bubbles: true }));
        ui.toast('Replaced ✓', 'success');
      } else if (target?.kind === 'contenteditable') {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(selection.range);
        document.execCommand('insertText', false, result);
        ui.toast('Replaced ✓', 'success');
      } else {
        navigator.clipboard.writeText(result).then(
          () => ui.toast('Copied result to clipboard ✓', 'success'),
          () => ui.toast('Result ready (clipboard blocked).', 'info'),
        );
        AICopilot.ChatBox?.showResult?.(selection.text, result);
      }
    },

    askInChat() {
      const text = this.currentSelection?.text || '';
      this.hide();
      AICopilot.ChatBox?.openWith?.(text);
    },
  };

  AICopilot.TextToolbar = TextToolbar;
})();
