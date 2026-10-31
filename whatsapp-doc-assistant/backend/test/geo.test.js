// Search and AI-answer readiness (24 Oct 2026): the guides, server HTML for
// the public pages (src/prerender.js), sitemap dates, the crawler counter
// (src/bidpilot/crawlers.js) and one Kerala list for both CPPP spellings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderIndexHtml, sitemapXml, structuredData, llmsTxt, GUIDES, GUIDES_CHECKED, PUBLIC_PAGES } from '../src/seo.js';
import { createPrerender } from '../src/prerender.js';
import { crawlerFrom, crawlerPath, createCrawlerCounter } from '../src/bidpilot/crawlers.js';
import { canonicalState, stateNames, searchFeed, feedFacets } from '../src/bidpilot/repo/publicTenders.js';
import { landingRedirect, landingPagesFrom } from '../src/landingPages.js';
import { normalizePath } from '../src/bidpilot/visits.js';
import { insights } from '../src/bidpilot/insights.js';
import { GUIDES as APP_GUIDES, GUIDES_CHECKED as APP_CHECKED, guidePath } from '../../frontend/src/guides/guides.ts';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './db/helpers.js';
import { publicTenders, crawlerHits } from '../src/db/schema/index.js';

const BASE = 'https://tendertez.in';
const INDEX = '<html><head><title>TenderTez</title></head><body><div id="root"></div></body></html>';

test('the app and the server list the same guides, headlines and checked date', () => {
  assert.equal(APP_CHECKED, GUIDES_CHECKED);
  assert.deepEqual(APP_GUIDES.map((g) => [guidePath(g.slug), g.title]), GUIDES.map((g) => [g.path, g.headline]));
});

test('guides are public pages: indexable, in llms.txt, with Article and breadcrumb data', () => {
  for (const g of GUIDES) {
    assert.ok(PUBLIC_PAGES[g.path], g.path);
    const html = renderIndexHtml(INDEX, g.path, BASE);
    assert.doesNotMatch(html, /noindex/);
    const [article, crumbs] = structuredData(g.path, BASE);
    assert.equal(article['@type'], 'Article');
    assert.equal(article.headline, g.headline);
    assert.equal(article.dateModified, GUIDES_CHECKED);
    assert.ok(article.citation.length >= 1 && article.citation.every((u) => u.startsWith('https://')));
    assert.equal(crumbs['@type'], 'BreadcrumbList');
    assert.ok(llmsTxt(BASE).includes(`${BASE}${g.path}`));
  }
  assert.ok(PUBLIC_PAGES['/guides']);
  assert.equal(normalizePath('/guides/emd-exemption'), '/guides/emd-exemption', 'visits count each guide');
  assert.equal(normalizePath('/guides/unknown'), '(other)');
});

test('server HTML goes inside #root for public pages only', () => {
  const body = '<main><h1>Pricing</h1></main>';
  const html = renderIndexHtml(INDEX, '/pricing/', BASE, (p) => (p === '/pricing' ? body : null));
  assert.ok(html.includes(`<div id="root">${body}</div>`));
  const app = renderIndexHtml(INDEX, '/dashboard', BASE, () => body);
  assert.ok(app.includes('<div id="root"></div>'), 'app pages never get server HTML');
  assert.ok(renderIndexHtml(INDEX, '/faq', BASE).includes('<div id="root"></div>'), 'no renderer: empty root as before');
});

test('the prerender loader renders, caches, and falls back when the bundle is missing or fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
  const bundle = path.join(dir, 'prerender.js');
  fs.writeFileSync(bundle, `let n = 0;
export const PRERENDER_PATHS = ['/', '/faq'];
export function render(p) { if (p === '/faq') throw new Error('boom'); n += 1; return '<h1>Home ' + n + '</h1>'; }`);
  const quiet = { warn() {}, error() {} };
  const pre = createPrerender(bundle, { log: quiet });
  await pre.ready;
  assert.equal(pre.html('/'), '<h1>Home 1</h1>');
  assert.equal(pre.html('/'), '<h1>Home 1</h1>', 'cached');
  assert.equal(pre.html('/faq'), null, 'a failed render serves the page without server HTML');
  assert.equal(pre.html('/pricing'), null, 'not a prerendered path');
  const stale = createPrerender(bundle, { log: quiet, ttlMs: 0 });
  await stale.ready;
  stale.html('/');
  assert.notEqual(stale.html('/'), '<h1>Home 1</h1>', 'renders again after the cache time');
  const missing = createPrerender(path.join(dir, 'nope.js'), { log: quiet });
  await missing.ready;
  assert.equal(missing.html('/'), null);
});

test('the real frontend bundle renders every public page with its H1 and text', { skip: !fs.existsSync(new URL('../../frontend/dist-ssr/prerender.js', import.meta.url)) && 'frontend not built' }, async () => {
  const pre = createPrerender(new URL('../../frontend/dist-ssr/prerender.js', import.meta.url).pathname);
  await pre.ready;
  const expected = ['/', '/government-tenders', '/features', '/pricing', '/faq', '/about', '/privacy-policy', '/tender-consultants', '/guides', ...GUIDES.map((g) => g.path)];
  assert.deepEqual([...pre.paths()].sort(), expected.sort());
  for (const p of expected) {
    const html = pre.html(p);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p}: one H1`);
    assert.doesNotMatch(html, /style="/, `${p}: no inline styles (CSP)`);
    const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 150, `${p}: ${words} words`);
  }
  assert.match(pre.html('/'), /TenderTez is an AI tool that reads Indian government tenders/);
  assert.match(pre.html('/guides/emd-exemption'), /Traders are excluded from the purview of this Policy/);
});

test('sitemap dates: guides carry their checked date, tender lists today, other pages none', () => {
  const xml = sitemapXml(BASE, ['/government-tenders/state/goa'], new Date('2026-10-24T20:00:00Z'));
  assert.match(xml, /<loc>https:\/\/tendertez.in\/guides\/emd-exemption<\/loc><lastmod>2026-10-24<\/lastmod>/);
  assert.match(xml, /state\/goa<\/loc><lastmod>2026-10-25<\/lastmod>/, 'India date, not UTC');
  assert.match(xml, /<loc>https:\/\/tendertez.in\/pricing<\/loc><\/url>/);
});

test('crawlers are named from their user agent; people are not', () => {
  assert.equal(crawlerFrom('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)'), 'GPTBot (OpenAI)');
  assert.equal(crawlerFrom('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'), 'ClaudeBot (Anthropic)');
  assert.equal(crawlerFrom('Mozilla/5.0 (compatible; PerplexityBot/1.0)'), 'PerplexityBot');
  assert.equal(crawlerFrom('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), 'Bingbot');
  assert.equal(crawlerFrom('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'), null);
  assert.equal(crawlerFrom(''), null);
  assert.equal(crawlerPath('/pricing?utm=x'), '/pricing');
  assert.equal(crawlerPath('/llms.txt'), '/llms.txt');
  assert.equal(crawlerPath('/government-tenders/state/goa/'), '/government-tenders/state/goa');
  assert.equal(crawlerPath('/wp-admin/setup.php'), '(other)', 'unknown paths are pooled, not stored');
});

test('Kerala and Keralam are one state', () => {
  assert.equal(canonicalState('Keralam'), 'Kerala');
  assert.deepEqual(stateNames('Keralam'), ['Kerala', 'Keralam']);
  assert.deepEqual(stateNames('Goa'), ['Goa']);
  assert.equal(landingRedirect('/government-tenders/state/keralam'), '/government-tenders/state/kerala');
  assert.equal(landingRedirect('/government-tenders/state/kerala'), null);
});

const SKIP_DB = !dbAvailable() && 'DATABASE_URL not set';

test('database: Kerala merge, crawler counts and the dashboard', { skip: SKIP_DB }, async (t) => {
  const db = testDb();
  t.after(async () => { await truncateAll(); await closeTestDb(); });
  t.beforeEach(truncateAll);

  await t.test('search, counts and the landing page treat both spellings as Kerala', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000);
    await db.insert(publicTenders).values([
      ...Array.from({ length: 12 }, (_, i) => ({ source: 'cppp', sourceKey: `k-${i}`, kind: 'state', state: 'Kerala', title: `K ${i}`, closingAt: soon })),
      ...Array.from({ length: 13 }, (_, i) => ({ source: 'cppp', sourceKey: `km-${i}`, kind: 'state', state: 'Keralam', title: `KM ${i}`, closingAt: soon })),
    ]);
    const facets = await feedFacets(db);
    assert.deepEqual(facets.states, [{ name: 'Kerala', count: 25 }]);
    const pages = landingPagesFrom(facets);
    assert.deepEqual(pages.map((p) => [p.path, p.count]), [['/government-tenders/state/kerala', 25]]);
    const filters = { kind: 'state', status: 'open', sort: 'closing', page: 1, limit: 50, search: '', organisation: '' };
    assert.equal((await searchFeed(db, { ...filters, state: 'Kerala' })).total, 25);
    assert.equal((await searchFeed(db, { ...filters, state: 'Keralam' })).total, 25);
  });

  await t.test('crawler requests are counted per day, crawler and page, and shown on the dashboard', async () => {
    const counter = createCrawlerCounter({ db, flushMs: 0 });
    const hit = (ua, p, method = 'GET') => counter.middleware({ method, path: p, get: () => ua }, {}, () => {});
    const gpt = 'Mozilla/5.0 (compatible; GPTBot/1.1)';
    hit(gpt, '/pricing'); hit(gpt, '/pricing'); hit(gpt, '/llms.txt');
    hit('Mozilla/5.0 (compatible; ClaudeBot/1.0)', '/guides/emd-exemption');
    hit(gpt, '/bidpilot/me');
    hit(gpt, '/assets/index.js');
    hit(gpt, '/pricing', 'POST');
    hit('Mozilla/5.0 Chrome/126 Safari/537.36', '/pricing');
    await counter.flush();
    hit(gpt, '/pricing');
    await counter.flush();
    const rows = await db.select().from(crawlerHits);
    const byKey = Object.fromEntries(rows.map((r) => [`${r.bot} ${r.path}`, r.hits]));
    assert.deepEqual(byKey, { 'GPTBot (OpenAI) /pricing': 3, 'GPTBot (OpenAI) /llms.txt': 1, 'ClaudeBot (Anthropic) /guides/emd-exemption': 1 });
    assert.deepEqual(Object.keys(rows[0]).sort(), ['bot', 'day', 'hits', 'path'], 'no IP or user agent column');

    const r = await insights(db, { days: 7, adminEmails: [] });
    assert.deepEqual(r.crawlers.bots.map((b) => [b.label, b.hits]), [['GPTBot (OpenAI)', 4], ['ClaudeBot (Anthropic)', 1]]);
    assert.equal(r.crawlers.pages[0].label, '/pricing');
  });
});
