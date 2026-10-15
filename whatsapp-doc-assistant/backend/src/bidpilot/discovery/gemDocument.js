// A GeM bid's document link, found when a user asks for it. CPPP's public
// GeM page for a bid (`gemtendersfullview/<hash>`, stored with the row)
// shows a "Bid Document" link to bidplus.gem.gov.in/doc_cppp/<token>. We read
// that page once per bid when someone clicks "Bid document" (never in the
// background), keep the link for 12 hours, and send the user's browser to
// it. The PDF itself is never fetched by us: GeM serves it to the user.

import { USER_AGENT } from './collector.js';

const VIEW_RE = /^https:\/\/eprocure\.gov\.in\/cppp\/gemtendersfullview\/[A-Za-z0-9+/=]+$/;
const DOC_RE = /href="(https:\/\/bidplus\.gem\.gov\.in\/doc_cppp\/[A-Za-z0-9_-]+)"/;
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CACHE = 5000;

let fetchImpl = (...args) => fetch(...args);
/** Tests replace the network call. */
export function setGemDocumentFetch(fn) { fetchImpl = fn; }

const cache = new Map(); // view URL -> { url, at }
export function _resetGemDocumentCache() { cache.clear(); }

/** The bid document link on a saved GeM page, or null. */
export function parseGemDocumentLink(html) {
  const m = String(html).match(DOC_RE);
  return m ? m[1] : null;
}

/** Only CPPP's GeM pages may be fetched. */
export function isGemViewUrl(url) {
  return VIEW_RE.test(String(url ?? ''));
}

/** @returns {Promise<string|null>} the doc_cppp link, or null when the page has none. Throws on network errors. */
export async function gemDocumentUrl(viewUrl, now = Date.now()) {
  if (!isGemViewUrl(viewUrl)) return null;
  const hit = cache.get(viewUrl);
  if (hit && now - hit.at < TTL_MS) return hit.url;
  const res = await fetchImpl(viewUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 200) throw new Error(`CPPP answered ${res.status}`);
  const url = parseGemDocumentLink(await res.text());
  if (url) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(viewUrl, { url, at: now });
  }
  return url;
}
