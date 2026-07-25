// components/formFill.js
// Adds a small "✦" affordance to text inputs and textareas. Clicking it asks
// the model to suggest a value based on the field's label, type, and page
// context, then fills it in. A MutationObserver keeps up with dynamic forms.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});
  const { ui, api, prompts } = AICopilot;

  const SELECTOR =
    'input[type="text"], input[type="email"], input[type="url"], input[type="search"], input:not([type]), textarea';

  const FormFill = {
    enabled: true,
    observer: null,
    decorated: new WeakSet(),

    mount() {
      this.scan();
      this.observer = new MutationObserver(() => this.scheduleScan());
      this.observer.observe(document.body, { childList: true, subtree: true });
    },

    setEnabled(enabled) {
      this.enabled = enabled;
      document.querySelectorAll('.aicp-fieldbtn').forEach((b) => {
        b.style.display = enabled ? '' : 'none';
      });
      if (enabled) this.scan();
    },

    scheduleScan() {
      clearTimeout(this._scanTimer);
      this._scanTimer = setTimeout(() => this.scan(), 400);
    },

    scan() {
      if (!this.enabled) return;
      document.querySelectorAll(SELECTOR).forEach((field) => this.decorate(field));
    },

    decorate(field) {
      if (this.decorated.has(field) || field.dataset.aicpSkip) return;
      // Skip hidden, tiny, or password-like fields.
      const rect = field.getBoundingClientRect();
      if (field.type === 'password' || rect.width < 80 || rect.height < 16) return;
      if (field.offsetParent === null) return;

      this.decorated.add(field);

      const btn = ui.el('button', {
        class: 'aicp-fieldbtn',
        type: 'button',
        title: 'Suggest with AI',
        text: '✦',
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.fill(field, btn);
        },
      });

      // Position relative to the field using a wrapper so we don't disturb layout.
      const place = () => {
        const r = field.getBoundingClientRect();
        btn.style.top = `${window.scrollY + r.top + 4}px`;
        btn.style.left = `${window.scrollX + r.right - 26}px`;
      };
      btn.style.position = 'absolute';
      document.body.appendChild(btn);
      place();

      field.addEventListener('focus', place);
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);

      // Hide the button when the field is removed from the DOM.
      const cleanup = new MutationObserver(() => {
        if (!document.contains(field)) {
          btn.remove();
          cleanup.disconnect();
        }
      });
      cleanup.observe(document.body, { childList: true, subtree: true });
    },

    labelFor(field) {
      if (field.labels && field.labels.length) return field.labels[0].innerText.trim();
      if (field.getAttribute('aria-label')) return field.getAttribute('aria-label');
      if (field.placeholder) return field.placeholder;
      if (field.name) return field.name.replace(/[_-]+/g, ' ');
      return '';
    },

    async fill(field, btn) {
      if (!this.enabled) return;
      btn.classList.add('aicp-fieldbtn--busy');
      btn.textContent = '…';
      try {
        const { system, prompt } = prompts.formField({
          label: this.labelFor(field),
          type: field.type || field.tagName.toLowerCase(),
          context: document.title,
        });
        const { text } = await api.complete({ system, prompt, maxTokens: 200 });
        const value = text.trim().replace(/^["']|["']$/g, '');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        ui.toast('Filled ✓', 'success');
      } catch (err) {
        ui.toast(err.message || 'Could not fill field.', 'error');
      } finally {
        btn.classList.remove('aicp-fieldbtn--busy');
        btn.textContent = '✦';
      }
    },
  };

  AICopilot.FormFill = FormFill;
})();
