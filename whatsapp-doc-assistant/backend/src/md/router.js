// Serves the markdown versions of the public pages and the AI discovery files.
// -----------------------------------------------------------------------------
// One handler (renderMarkdown in registry.js), reached three ways:
//   GET /pricing.md, /index.md, /government-tenders/state/goa.md
//   GET /pricing with Accept preferring text/markdown (see http.js)
//   GET /api/md/pricing (always markdown; /api/md/_catalog lists them all)
// plus /llms.txt, /llms-full.txt and /ai.txt. Mounted after the static files,
// so a real file ending in .md is served as it is.

import express from 'express';
import { llmsTxt, aiTxt } from '../seo.js';
import { landingRedirect } from '../landingPages.js';
import { canonicalPath, listMarkdownRoutes, renderMarkdown, resolve, MarkdownNotFound } from './registry.js';
import { CACHE, prefersMarkdown, sendMarkdown, sendText, setCors } from './http.js';
import { mdPathFor, todayInIndia } from './format.js';

// Tender lists included in llms-full.txt (the rest are listed in llms.txt).
export const FULL_LISTS = 10;
const FULL_WARN_CHARS = 500_000;
const FULL_TTL_MS = 24 * 60 * 60 * 1000;

const htmlUrl = (baseUrl, path) => `${baseUrl}${path === '/' ? '/' : path}`;
const lastUpdatedIn = (md) => /^Last updated: (\d{4}-\d{2}-\d{2})$/m.exec(md)?.[1] ?? null;

function message(title, text, baseUrl) {
  return `# ${title}\n\n> ${text}\n\nThe pages that have a markdown version are listed at ${baseUrl}/llms.txt\n`;
}

export function createMarkdownRouter({ baseUrl, prerender, db = null, facets = async () => null, log = console }) {
  const router = express.Router();
  const ctx = { baseUrl, prerender, db, facets };
  const full = { body: null, at: 0, pending: null };

  async function serve(req, res, rawPath, negotiated = false) {
    const path = canonicalPath(rawPath);
    const moved = landingRedirect(path);
    if (moved) return res.redirect(301, negotiated ? moved : mdPathFor(moved));
    try {
      const body = await renderMarkdown(path, ctx);
      const list = path.startsWith('/government-tenders');
      return sendMarkdown(res, body, {
        canonical: htmlUrl(baseUrl, path), lastUpdated: lastUpdatedIn(body), cache: list ? CACHE.list : CACHE.page, negotiated,
      });
    } catch (err) {
      if (err instanceof MarkdownNotFound) {
        return sendMarkdown(res, message('Not found', `There is no public page at ${path}.`, baseUrl), { status: 404, negotiated });
      }
      log.error(`markdown: ${path} failed:`, err);
      return sendMarkdown(res, message('Not available right now', `The markdown version of ${path} could not be made. Please try again later.`, baseUrl), { status: 503, negotiated });
    }
  }

  async function buildFull() {
    const routes = await listMarkdownRoutes({ facets });
    const lists = routes.filter((r) => r.group === 'lists');
    const chosen = [
      ...routes.filter((r) => r.group === 'core'), ...routes.filter((r) => r.group === 'guides'),
      ...lists.slice(0, FULL_LISTS), ...routes.filter((r) => r.group === 'legal'),
    ];
    const parts = [
      '# TenderTez - full content',
      `> Every public page of ${baseUrl} as markdown, from the same renderer as each page's .md version.`,
      `Generated: ${todayInIndia()}`,
      lists.length > FULL_LISTS
        ? `Tender lists: the ${FULL_LISTS} with the most open tenders are included; all ${lists.length} are listed in ${baseUrl}/llms.txt and ${baseUrl}/api/md/_catalog.`
        : '',
    ].filter(Boolean);
    for (const r of chosen) {
      try {
        parts.push('---', `<!-- source: ${htmlUrl(baseUrl, r.path)} -->`, (await renderMarkdown(r.path, ctx)).trim());
      } catch (err) {
        log.warn(`llms-full: ${r.path} left out (${err.message})`);
      }
    }
    const body = `${parts.join('\n\n')}\n`;
    if (body.length > FULL_WARN_CHARS) log.warn(`llms-full: ${body.length} characters, over ${FULL_WARN_CHARS}`);
    return body;
  }

  // Preflight for every markdown and discovery URL.
  router.use((req, res, next) => {
    if (req.method !== 'OPTIONS') return next();
    if (!/\.(md|txt)$/.test(req.path) && !req.path.startsWith('/api/md/')) return next();
    setCors(res);
    res.set('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  });

  router.get('/llms.txt', async (_req, res) => sendText(res, llmsTxt(baseUrl, await listMarkdownRoutes({ facets }))));
  router.get('/ai.txt', (_req, res) => sendText(res, aiTxt(baseUrl)));
  router.get('/llms-full.txt', async (_req, res) => {
    if (!full.body || Date.now() - full.at > FULL_TTL_MS) {
      full.pending ??= buildFull().then((b) => { full.body = b; full.at = Date.now(); }).finally(() => { full.pending = null; });
      await full.pending;
    }
    return sendText(res, full.body, CACHE.full);
  });

  router.get('/api/md/_catalog', async (_req, res) => {
    setCors(res);
    res.set('Cache-Control', CACHE.list);
    res.set('X-Robots-Tag', 'noindex, follow');
    const routes = await listMarkdownRoutes({ facets });
    res.json({
      site: 'TenderTez', url: `${baseUrl}/`, generated: todayInIndia(),
      pages: routes.map((r) => ({ ...r, url: htmlUrl(baseUrl, r.path), markdown: `${baseUrl}${mdPathFor(r.path)}` })),
    });
  });
  router.get(/^\/api\/md(\/.*)?$/, (req, res) => serve(req, res, req.params[0] || '/'));

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/bidpilot') || req.path.startsWith('/.well-known/')) return next();
    // /pricing.md, /index.md: the markdown version of the page.
    if (req.path.endsWith('.md')) return serve(req, res, req.path.slice(0, -3));
    // Content negotiation, only on paths that have a markdown version.
    if (!resolve(req.path)) return next();
    res.vary('Accept');
    if (prefersMarkdown(req.get('accept'))) return serve(req, res, req.path, true);
    return next();
  });

  return router;
}

export { MarkdownNotFound };
