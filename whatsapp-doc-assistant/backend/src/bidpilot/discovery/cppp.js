// Reads the Central Public Procurement Portal's public "latest active
// tenders" lists (no sign-in, no captcha) into plain rows. Three lists:
//   - central: central ministries, PSUs and other central bodies (cpppdata)
//   - state:   tenders from the state e-procurement portals (mmpdata)
//   - gem:     bids on the Government e-Marketplace (gemdata)
// Each list is paged 10 rows at a time; page N is reached through the list's
// own "?url=<base64>" pager links, which need no captcha. The captcha on
// those pages belongs to their search box, which this never uses. Searching,
// and opening a tender's full view, are left to the user on the portal.
//
// Central and state rows link to `tendersfullview...` pages that work only
// inside the session that loaded the list ("Invalid Url" for anyone else,
// and a captcha even then). Those links are therefore never stored: the
// row keeps the portal's tender id, and portals.js says where to search for
// it. GeM rows link to `gemtendersfullview/<hash>`, which opens for anyone.

import { parseTenderDate } from '../analysis/dates.js';

const BASE = 'https://eprocure.gov.in/cppp/latestactivetendersnew';
export const CPPP_LISTS = {
  central: { source: 'cppp', url: `${BASE}/cpppdata` },
  state: { source: 'cppp-state', url: `${BASE}/mmpdata` },
  gem: { source: 'cppp-gem', url: `${BASE}/gemdata` },
};
export const CPPP_LATEST_URL = CPPP_LISTS.central.url;

/** The URL of page `n` of a list, as the portal's own pager builds it. */
export function cpppPageUrl(list, n) {
  const base = CPPP_LISTS[list].url;
  if (n <= 1) return base;
  const inner = Buffer.from(`${base}?page=${n}`).toString('base64');
  return `${base}?url=${encodeURIComponent(inner)}`;
}

const decodeEntities = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const text = (html) => decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s ? s.slice(0, n) : null);

/** The portal's own numeric id, from the first base64 part of a full-view link. */
export function cpppIdFromUrl(url) {
  const m = String(url).match(/tendersfullview(?:mmp)?\/([A-Za-z0-9+/=]+?)A13h1/);
  if (!m) return null;
  try {
    const id = Buffer.from(m[1], 'base64').toString('utf8');
    return /^\d{4,15}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The highest page number in the list's pager, or null when there is none. */
export function parseLastPage(html) {
  const nums = [...String(html).matchAll(/class="paginate_button"[^>]*>\s*(\d+)\s*</g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

// GeM's "product category" cell is sometimes a list of item codes
// (1142040035001D,1142040035001C,...), which means nothing to a reader.
const isCodeList = (s) => /^[0-9A-Z]{8,}(,[0-9A-Z]{8,})*$/.test(s.replace(/\s/g, ''));

/**
 * @param {'central'|'state'|'gem'} list
 * @returns {{ rows: object[], tableFound: boolean }}
 */
export function parseCpppList(html, list = 'central') {
  const start = html.indexOf('<table id="table"');
  if (start === -1) return { rows: [], tableFound: false };
  const table = html.slice(start, html.indexOf('</table>', start));
  const rows = [];
  for (const tr of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 6) continue; // the header row uses <th>, or a malformed row
    const row = list === 'gem' ? gemRow(cells) : tenderRow(cells, list);
    if (row) rows.push(row);
  }
  return { rows, tableFound: true };
}

// Central and state: date published, closing, opening, "title/ref/tender id",
// then the organisation (central) or the state's name (state).
function tenderRow(cells, list) {
  const link = cells[4].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)/);
  if (!link) return null;
  const href = decodeEntities(link[1]);
  if (!/^https:\/\/eprocure\.gov\.in\/cppp\//.test(href)) return null;
  const title = text(link[2]);
  // After the title: "/<reference number>/<tender id>"; the reference itself may contain "/".
  const parts = text(link[3]).replace(/^\/+/, '').split('/').map((p) => p.trim()).filter(Boolean);
  const tenderId = parts.length ? parts[parts.length - 1] : null;
  const ref = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
  // Some departments (CPWD, for one) publish the reference as the title too.
  const reference = ref && ref !== title ? ref : null;
  const sourceKey = cpppIdFromUrl(href) ?? tenderId;
  if (!title || !sourceKey) return null;
  const place = text(cells[5]) || null;
  return {
    source: CPPP_LISTS[list].source,
    kind: list,
    sourceKey,
    title: title.slice(0, 1000),
    reference: clip(reference, 300),
    tenderId: clip(tenderId, 120),
    organisation: list === 'central' ? clip(place, 300) : null,
    state: list === 'state' ? clip(place, 80) : null,
    department: null,
    category: null,
    publishedAt: parseTenderDate(text(cells[1])),
    closingAt: parseTenderDate(text(cells[2])),
    openingAt: parseTenderDate(text(cells[3])),
    url: null, // session-bound on the portal; see the note at the top
  };
}

// GeM: bid start, bid end, "bid number/quantity", product category,
// organisation, department.
function gemRow(cells) {
  const link = cells[3].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)/);
  if (!link) return null;
  const href = decodeEntities(link[1]);
  const bid = text(link[2]);
  if (!/^GEM\/\d{4}\/[A-Z]\/\d+$/.test(bid)) return null;
  const url = /^https:\/\/eprocure\.gov\.in\/cppp\/gemtendersfullview\/[A-Za-z0-9+/=]+$/.test(href) ? href : null;
  const quantity = text(link[3]).replace(/^\/+/, '');
  const category = text(cells[4]);
  const organisation = text(cells[5]) || null;
  const department = text(cells[6] ?? '') || null;
  const readable = category && !isCodeList(category) ? category : null;
  return {
    source: CPPP_LISTS.gem.source,
    kind: 'gem',
    sourceKey: bid,
    title: (readable ?? `GeM bid ${bid}`).slice(0, 1000),
    reference: quantity ? clip(`Quantity ${quantity}`, 300) : null,
    tenderId: bid,
    organisation: clip(organisation, 300),
    state: null,
    department: clip(department, 300),
    category: clip(readable, 300),
    publishedAt: parseTenderDate(text(cells[1])),
    closingAt: parseTenderDate(text(cells[2])),
    openingAt: null,
    url,
  };
}

/** Kept for the first collector's callers: the central list. */
export function parseCpppLatest(html) {
  return parseCpppList(html, 'central');
}
