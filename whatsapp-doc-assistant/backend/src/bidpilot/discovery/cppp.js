// Reads the Central Public Procurement Portal's public "latest active
// tenders" page (no sign-in, no captcha) into plain rows. Only the newest
// tenders are on that page; searching and paging need a captcha, which this
// never attempts. See collector.js for how often it is read.

import { parseTenderDate } from '../analysis/dates.js';

export const CPPP_LATEST_URL = 'https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata';

const decodeEntities = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const text = (html) => decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The portal's own numeric id, from the first base64 part of a full-view link. */
export function cpppIdFromUrl(url) {
  const m = String(url).match(/tendersfullview\/([A-Za-z0-9+/=]+?)A13h1/);
  if (!m) return null;
  try {
    const id = Buffer.from(m[1], 'base64').toString('utf8');
    return /^\d{4,15}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ rows: Array<{ sourceKey, title, reference, organisation, publishedAt, closingAt, openingAt, url }>, tableFound: boolean }}
 */
export function parseCpppLatest(html) {
  const start = html.indexOf('<table id="table"');
  if (start === -1) return { rows: [], tableFound: false };
  const table = html.slice(start, html.indexOf('</table>', start));
  const rows = [];
  for (const tr of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 6) continue; // the header row uses <th>, or a malformed row
    const link = cells[4].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)/);
    if (!link) continue;
    const url = decodeEntities(link[1]);
    if (!/^https:\/\/eprocure\.gov\.in\/cppp\//.test(url)) continue;
    const title = text(link[2]);
    // After the title: "/<reference number>/<tender id>".
    const tail = text(link[3]).replace(/^\/+/, '');
    const parts = tail.split('/').map((p) => p.trim()).filter(Boolean);
    const tenderId = parts.length > 1 ? parts[parts.length - 1] : null;
    const reference = parts.length > 1 ? parts.slice(0, -1).join('/') : (parts[0] ?? null);
    const sourceKey = cpppIdFromUrl(url) ?? tenderId;
    if (!title || !sourceKey) continue;
    rows.push({
      sourceKey,
      title: title.slice(0, 1000),
      reference: [reference, tenderId].filter(Boolean).join(' · ').slice(0, 300) || null,
      organisation: text(cells[5]).slice(0, 300) || null,
      publishedAt: parseTenderDate(text(cells[1])),
      closingAt: parseTenderDate(text(cells[2])),
      openingAt: parseTenderDate(text(cells[3])),
      url,
    });
  }
  return { rows, tableFound: true };
}
