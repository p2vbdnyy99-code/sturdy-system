// Shared markdown helpers for the markdown versions of the public pages
// (src/md/registry.js). Every link they write is absolute and points at the
// HTML page, which stays the canonical version.

/** Escape text so markdown doesn't read it as formatting. Intraword
 *  underscores (tender IDs such as 2026_BPCL_27128) are left alone. */
export function escapeMd(text) {
  return String(text ?? '').replace(/([\\`*[\]])/g, '\\$1');
}

/** An absolute URL for a site path; other URLs are returned as they are. */
export function absUrl(href, baseUrl) {
  if (!href) return baseUrl;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  return `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
}

export function link(text, href, baseUrl) {
  return `[${escapeMd(text)}](${absUrl(href, baseUrl).replace(/\)/g, '%29').replace(/ /g, '%20')})`;
}

export const heading = (level, text) => `${'#'.repeat(level)} ${String(text).trim()}`;

export const list = (items, ordered = false) => items.map((it, i) => `${ordered ? `${i + 1}.` : '-'} ${it}`).join('\n');

/** A markdown table; cells are escaped and pipes kept inside cells. */
export function table(head, rows) {
  const cell = (c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  return [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}

/** YYYY-MM-DD for a date (UTC calendar day), or null. */
export function isoDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Today's date in India, YYYY-MM-DD. */
export const todayInIndia = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** The .md URL for a page's canonical HTML path ("/" is /index.md). */
export const mdPathFor = (path) => (path === '/' ? '/index.md' : `${path}.md`);

/**
 * One markdown page in the site's standard shape: title, summary,
 * canonical URL, date (only when known), the page's main content, and
 * related links.
 */
export function mdPage({ title, summary, canonical, lastUpdated, body, related = [] }) {
  const parts = [heading(1, title), ''];
  if (summary) parts.push(`> ${summary}`, '');
  parts.push(`Canonical: ${canonical}`);
  if (lastUpdated) parts.push(`Last updated: ${lastUpdated}`);
  parts.push('', String(body).trim());
  if (related.length) parts.push('', heading(2, 'Related'), list(related));
  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
