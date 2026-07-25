// components/floatingButton.js
// A draggable, always-on-top launcher button. Also hosts the small shared DOM
// helpers (AICopilot.ui) used by the other components, since it loads first.

(function () {
  const AICopilot = (window.AICopilot = window.AICopilot || {});

  // ── Shared DOM helpers ─────────────────────────────────────────────────────
  const ui = {
    /** Create an element: el('div', { class: 'x', onclick: fn }, [children|text]) */
    el(tag, props = {}, children = []) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(props)) {
        if (value == null) continue;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(node.style, value);
        } else {
          node.setAttribute(key, value);
        }
      }
      for (const child of [].concat(children)) {
        if (child == null || child === false) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
      }
      return node;
    },

    escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
      );
    },

    /** Minimal markdown-ish renderer: code blocks, inline code, bold, lists. */
    renderMarkdown(text) {
      const escaped = ui.escapeHtml(text);
      return escaped
        .replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code.trim()}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
    },

    toast(message, kind = 'info') {
      const node = ui.el('div', { class: `aicp-toast aicp-toast--${kind}`, text: message });
      document.body.appendChild(node);
      requestAnimationFrame(() => node.classList.add('aicp-toast--in'));
      setTimeout(() => {
        node.classList.remove('aicp-toast--in');
        setTimeout(() => node.remove(), 300);
      }, 2600);
    },
  };
  AICopilot.ui = ui;

  // ── Floating button ─────────────────────────────────────────────────────────
  const FloatingButton = {
    root: null,

    mount({ onClick } = {}) {
      if (this.root) return this.root;
      const btn = ui.el('button', {
        class: 'aicp-fab',
        title: 'AI Copilot — click to chat, drag to move',
        'aria-label': 'Open AI Copilot',
        html: '<span class="aicp-fab__spark">✦</span>',
      });

      // Drag support with a small threshold so clicks still register.
      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;

      btn.addEventListener('mousedown', (e) => {
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = btn.getBoundingClientRect();
        originX = rect.left;
        originY = rect.top;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        if (moved) {
          btn.style.left = `${Math.max(8, originX + dx)}px`;
          btn.style.top = `${Math.max(8, originY + dy)}px`;
          btn.style.right = 'auto';
          btn.style.bottom = 'auto';
        }
      });

      window.addEventListener('mouseup', () => {
        dragging = false;
      });

      btn.addEventListener('click', () => {
        if (moved) return; // it was a drag, not a click
        onClick?.();
      });

      document.body.appendChild(btn);
      this.root = btn;
      return btn;
    },

    setVisible(visible) {
      if (this.root) this.root.style.display = visible ? '' : 'none';
    },
  };

  AICopilot.FloatingButton = FloatingButton;
})();
