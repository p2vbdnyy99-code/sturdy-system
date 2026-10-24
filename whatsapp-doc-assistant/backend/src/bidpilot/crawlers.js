// Counts requests from known search and AI crawlers, so the founder can see
// whether GPTBot, ClaudeBot, PerplexityBot, Googlebot and others read the
// site at all (shown on /insights). Crawlers don't run the app, so the visit
// counter (visits.js) never sees them.
// -----------------------------------------------------------------------------
// Only the crawler's name, the page and the India day are kept: never an IP
// address or the full user agent. A user agent can be faked, so these are
// requests that call themselves a crawler, not proof of who sent them.
// Counts are added up in memory and written once a minute, so a burst of
// requests costs one upsert per (day, crawler, page).

import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { crawlerHits } from '../db/schema/index.js';
import { log } from '../logger.js';
import { isLandingPath } from '../landingPages.js';
import { PUBLIC_PAGES } from '../seo.js';
import { istDay } from './visits.js';

/** [user-agent token, name shown]. Matched case-insensitively, first match wins. */
export const CRAWLERS = [
  ['GPTBot', 'GPTBot (OpenAI)'],
  ['OAI-SearchBot', 'OAI-SearchBot (ChatGPT search)'],
  ['ChatGPT-User', 'ChatGPT-User'],
  ['ClaudeBot', 'ClaudeBot (Anthropic)'],
  ['Claude-SearchBot', 'Claude-SearchBot'],
  ['Claude-User', 'Claude-User'],
  ['PerplexityBot', 'PerplexityBot'],
  ['Perplexity-User', 'Perplexity-User'],
  ['Google-CloudVertexBot', 'Google-CloudVertexBot'],
  ['Googlebot', 'Googlebot'],
  ['bingbot', 'Bingbot'],
  ['DuckAssistBot', 'DuckAssistBot'],
  ['Applebot', 'Applebot'],
  ['Amazonbot', 'Amazonbot'],
  ['meta-externalagent', 'Meta AI'],
  ['Bytespider', 'Bytespider (ByteDance)'],
  ['CCBot', 'CCBot (Common Crawl)'],
];

const FILES = new Set(['/robots.txt', '/sitemap.xml', '/llms.txt']);

/** The crawler's name for a user agent, or null for anything else. */
export function crawlerFrom(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return null;
  const hit = CRAWLERS.find(([token]) => ua.includes(token.toLowerCase()));
  return hit ? hit[1] : null;
}

/** The page counted: a public page, a tender list, a crawler file, or '(other)'. */
export function crawlerPath(raw) {
  const path = String(raw || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (PUBLIC_PAGES[path] || FILES.has(path) || isLandingPath(path)) return path;
  return '(other)';
}

/**
 * Express middleware plus flush(). Counts GET/HEAD requests for pages and
 * crawler files; never the API or the app's assets.
 */
export function createCrawlerCounter({ db: injectedDb, flushMs = 60_000 } = {}) {
  const pending = new Map();
  const dbFor = () => injectedDb || getDb();

  async function flush() {
    if (!pending.size) return;
    const rows = [...pending].map(([key, hits]) => {
      const [day, bot, path] = key.split('\t');
      return { day, bot, path, hits };
    });
    pending.clear();
    try {
      await dbFor().insert(crawlerHits).values(rows)
        .onConflictDoUpdate({ target: [crawlerHits.day, crawlerHits.bot, crawlerHits.path], set: { hits: sql`${crawlerHits.hits} + excluded.hits` } });
    } catch (err) {
      log.warn(`crawlers: counts not saved (${err.message})`);
    }
  }

  const timer = flushMs ? setInterval(flush, flushMs) : null;
  timer?.unref();

  function middleware(req, _res, next) {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/bidpilot') && !req.path.startsWith('/assets/')) {
      const bot = crawlerFrom(req.get('user-agent'));
      if (bot) {
        const key = `${istDay()}\t${bot}\t${crawlerPath(req.path)}`;
        if (pending.size < 5000 || pending.has(key)) pending.set(key, (pending.get(key) ?? 0) + 1);
      }
    }
    next();
  }

  return { middleware, flush, stop: () => timer && clearInterval(timer) };
}
