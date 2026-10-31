// Markdown from the public pages' own server render (src/prerender.js), so
// the markdown version of a page can never say something the HTML doesn't.
// -----------------------------------------------------------------------------
// This reads only the markup React writes for our pages (renderToString:
// well-formed, every tag closed), not arbitrary HTML from the web. It keeps
// the page's <main> content and leaves out what isn't content: icons, form
// controls, the illustrative hero example, and the sign-up buttons repeated on
// every page (SKIP_* below).

import { absUrl, escapeMd, heading, link } from './format.js';

const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'wbr', 'area', 'col']);
const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'span', 'small', 'code', 'br', 'sup', 'sub', 'abbr', 'time', 'mark']);
const SKIP_TAGS = new Set(['svg', 'button', 'input', 'select', 'option', 'label', 'form', 'script', 'style', 'img', 'textarea', 'nav', 'noscript']);
// Not content: eyebrow labels, the made-up hero example, form-like widgets
// whose numbers load later, and calls to action repeated across pages.
const SKIP_CLASSES = ['home-kicker', 'home-preview', 'home-tender-kinds', 'home-hero-actions', 'home-cta', 'guide-cta',
  'pricing-plan-cta', 'home-step-number', 'visually-hidden', 'home-feature-icon'];

// Repeated cards that are really a table (the plans on /pricing): one row
// per card, one column per labelled part of the card.
const CARD_TABLES = {
  'pricing-plans': { card: 'pricing-plan', columns: [['Plan', 'pricing-plan-name'], ['Price', 'pricing-price'], ['Tenders', 'pricing-plan-quota'], ['Best for', 'muted']] },
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·', hellip: '…', ndash: '–', mdash: '—' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(s) {
  const attrs = {};
  for (const m of (s || '').matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** A node tree for React's server markup. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
    } else if (m[2]) {
      const node = { tag: m[2].toLowerCase(), attrs: parseAttrs(m[3]), children: [] };
      top.children.push(node);
      if (!VOID.has(node.tag) && !m[4]) stack.push(node);
    } else if (m[5]) {
      top.children.push({ text: decodeEntities(m[5]) });
    }
  }
  return root;
}

const classesOf = (node) => (node.attrs?.class || '').split(/\s+/);

function skipped(node) {
  if (node.text !== undefined) return false;
  if (SKIP_TAGS.has(node.tag) || node.attrs['aria-hidden'] === 'true') return true;
  const cls = classesOf(node);
  if (SKIP_CLASSES.some((c) => cls.includes(c))) return true;
  if (node.tag === 'span' && cls.includes('home-teaser-link')) return true; // "Read more" inside a linked card
  return node.tag === 'a' && cls.includes('btn-link') && /^\/(register|login)\b/.test(node.attrs.href || '');
}

const hasBlock = (node) => node.children?.some((c) => c.tag && !skipped(c) && (!INLINE.has(c.tag) || hasBlock(c)));
const isInline = (node) => node.text !== undefined || (INLINE.has(node.tag) && !(node.tag === 'a' && hasBlock(node)));

function textOf(node) {
  if (node.text !== undefined) return node.text;
  if (skipped(node)) return '';
  return node.children.map(textOf).join('');
}

const tidy = (s) => s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();

function inline(node, ctx) {
  if (node.text !== undefined) return escapeMd(node.text.replace(/\s+/g, ' '));
  if (skipped(node)) return '';
  const inner = node.children.map((c) => inline(c, ctx)).join('');
  const wrap = (mark) => {
    const t = inner.trim();
    if (!t) return inner;
    const lead = /^\s/.test(inner) ? ' ' : '';
    const trail = /\s$/.test(inner) ? ' ' : '';
    return `${lead}${mark}${t}${mark}${trail}`;
  };
  switch (node.tag) {
    case 'strong': case 'b': return wrap('**');
    case 'em': case 'i': return wrap('*');
    case 'code': return `\`${textOf(node).replace(/`/g, '')}\``;
    case 'br': return '\n';
    case 'a': {
      const href = node.attrs.href;
      const t = inner.replace(/\s+/g, ' ').trim();
      if (!href || href.startsWith('#') || !t) return inner;
      ctx.links.push({ text: textOf(node).replace(/\s+/g, ' ').trim(), href });
      return `[${t}](${absUrl(href, ctx.baseUrl).replace(/\)/g, '%29').replace(/ /g, '%20')})`;
    }
    default: return inner;
  }
}

function blocks(children, ctx) {
  const out = [];
  let run = [];
  const flush = () => {
    const t = tidy(run.join(''));
    if (t) out.push(t);
    run = [];
  };
  for (const ch of children) {
    if (skipped(ch)) continue;
    if (isInline(ch)) { run.push(inline(ch, ctx)); continue; }
    flush();
    const b = block(ch, ctx);
    if (b) out.push(b);
  }
  flush();
  return out;
}

function list(node, ordered, ctx) {
  const items = node.children.filter((c) => c.tag === 'li' && !skipped(c));
  return items.map((li, i) => {
    const marker = ordered ? `${i + 1}.` : '-';
    const pad = ' '.repeat(marker.length + 1);
    const [first = '', ...rest] = blocks(li.children, { ...ctx, inList: true });
    const indent = (s) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');
    return [`${marker} ${first.split('\n').join(`\n${pad}`)}`, ...rest.map(indent)].join('\n');
  }).join('\n');
}

function tableMd(node, ctx) {
  const rows = [];
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.tag === 'tr') rows.push(c.children.filter((x) => x.tag === 'th' || x.tag === 'td'));
      else if (c.tag) walk(c);
    }
  };
  walk(node);
  if (!rows.length) return '';
  const cell = (c) => tidy(c.children.map((x) => inline(x, ctx)).join('')).replace(/\n/g, ' ').replace(/\|/g, '\\|');
  const [head, ...body] = rows;
  return [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

function cardTable(node, spec) {
  const find = (n, cls) => (classesOf(n).includes(cls) ? n : (n.children || []).map((c) => (c.tag ? find(c, cls) : null)).find(Boolean));
  const cards = node.children.filter((c) => c.tag && classesOf(c).includes(spec.card));
  const text = (n) => (n ? textOf(n).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|') : '');
  return [`| ${spec.columns.map(([h]) => h).join(' | ')} |`, `| ${spec.columns.map(() => '---').join(' | ')} |`,
    ...cards.map((c) => `| ${spec.columns.map(([, cls]) => text(find(c, cls))).join(' | ')} |`)].join('\n');
}

function block(node, ctx) {
  const tag = node.tag;
  const cards = Object.entries(CARD_TABLES).find(([cls]) => classesOf(node).includes(cls));
  if (cards) return cardTable(node, cards[1]);
  const h = /^h([1-6])$/.exec(tag);
  if (h) {
    const text = tidy(node.children.map((c) => inline(c, ctx)).join('')).replace(/\n/g, ' ');
    if (!text) return '';
    if (ctx.cardLink && !ctx.cardLink.used) {
      ctx.cardLink.used = true;
      ctx.links.push({ text: textOf(node).trim(), href: ctx.cardLink.href });
      return heading(Number(h[1]), link(textOf(node).replace(/\s+/g, ' ').trim(), ctx.cardLink.href, ctx.baseUrl));
    }
    return ctx.inList ? `**${text}**` : heading(Number(h[1]), text);
  }
  switch (tag) {
    case 'p': return tidy(node.children.map((c) => inline(c, ctx)).join(''));
    case 'ul': return list(node, false, ctx);
    case 'ol': return list(node, true, ctx);
    case 'table': return tableMd(node, ctx);
    case 'blockquote': return blocks(node.children, ctx).join('\n\n').split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
    case 'summary': return heading(3, tidy(node.children.map((c) => inline(c, ctx)).join('')).replace(/\n/g, ' '));
    case 'a': {
      // A linked card (an <a> around a heading and text): link the heading.
      const cardLink = { href: node.attrs.href, used: false };
      const out = blocks(node.children, { ...ctx, cardLink });
      if (!cardLink.used && node.attrs.href) out.push(link(textOf(node).replace(/\s+/g, ' ').trim(), node.attrs.href, ctx.baseUrl));
      return out.join('\n\n');
    }
    default: return blocks(node.children, ctx).join('\n\n');
  }
}

function findFirst(node, tag) {
  for (const [i, c] of (node.children || []).entries()) {
    if (c.tag === tag) return { parent: node, index: i, node: c };
    const deeper = c.tag ? findFirst(c, tag) : null;
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Markdown of a page's <main>: its H1 as the title, the rest as the body,
 * and the site links it contains (for "Related").
 */
export function mainToMarkdown(pageHtml, baseUrl) {
  const start = pageHtml.indexOf('<main');
  const end = pageHtml.lastIndexOf('</main>');
  const root = parseHtml(start >= 0 && end > start ? pageHtml.slice(start, end + 7) : pageHtml);
  const h1 = findFirst(root, 'h1');
  let title = null;
  if (h1) {
    title = textOf(h1.node).replace(/\s+/g, ' ').trim();
    h1.parent.children.splice(h1.index, 1);
  }
  const ctx = { baseUrl, links: [] };
  const body = blocks(root.children, ctx).join('\n\n').replace(/\n{3,}/g, '\n\n');
  return { title, body, links: ctx.links };
}
