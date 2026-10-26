// Markdown versions of the public pages and the AI discovery files
// (src/md/*, src/seo.js llms.txt / ai.txt / robots.txt): coverage of every
// public route, Accept negotiation, headers, and the site files' facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { PUBLIC_PAGES, GUIDES, llmsTxt, aiTxt, robotsTxt, publicPageHead, structuredData, PRIVATE_PATHS, AI_SEARCH_BOTS, AI_TRAINING_BOTS } from '../src/seo.js';
import { resolve, SKIPPED, listMarkdownRoutes, renderMarkdown, canonicalPath } from '../src/md/registry.js';
import { parseAccept, prefersMarkdown } from '../src/md/http.js';
import { mainToMarkdown } from '../src/md/htmlToMd.js';
import { mdPage, link, mdPathFor } from '../src/md/format.js';
import { createMarkdownRouter } from '../src/md/router.js';
import { createPrerender } from '../src/prerender.js';

const BASE = 'https://tendertez.in';
const ROUTES_TSX = fs.readFileSync(new URL('../../frontend/src/routes.tsx', import.meta.url), 'utf8');
const appRoutes = [...ROUTES_TSX.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

test('every public route has a markdown renderer or is skipped with a reason', () => {
  assert.ok(appRoutes.length > 15, 'routes.tsx parsed');
  for (const route of appRoutes) {
    const concrete = route.replace(':group', 'state').replace(':slug', 'goa');
    const covered = Boolean(resolve(concrete)) || Boolean(SKIPPED[route]);
    assert.ok(covered, `${route}: add a renderer in src/md/registry.js or a reason in SKIPPED`);
  }
  for (const path of Object.keys(PUBLIC_PAGES)) {
    assert.ok(resolve(path) || SKIPPED[path], `${path} (PUBLIC_PAGES) has no markdown renderer`);
  }
  for (const reason of Object.values(SKIPPED)) assert.ok(reason.length > 5);
});

test('private and app paths never resolve to markdown', () => {
  for (const p of ['/dashboard', '/tenders/123', '/insights', '/company-profile', '/clients', '/feed', '/login', '/register', '/bidpilot/me']) {
    assert.equal(resolve(p), null, p);
  }
  assert.equal(canonicalPath('/index'), '/');
  assert.equal(canonicalPath('/pricing/'), '/pricing');
  assert.equal(mdPathFor('/'), '/index.md');
});

test('Accept negotiation: markdown only when it outranks HTML', () => {
  assert.deepEqual(parseAccept('text/markdown;q=0.5, text/html'), [{ type: 'text/markdown', q: 0.5 }, { type: 'text/html', q: 1 }]);
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, */*;q=0.1'), true);
  assert.equal(prefersMarkdown('text/markdown;q=0.9, text/html;q=0.8'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html'), false, 'a tie stays HTML');
  assert.equal(prefersMarkdown('text/markdown;q=0.5, text/html'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown(''), false);
  assert.equal(prefersMarkdown(undefined), false);
  assert.equal(prefersMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), false, 'a browser');
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
});

test('the converter keeps content and drops icons, forms and repeated sign-up buttons', () => {
  const html = '<header>menu</header><main><section><p class="home-kicker">FAQ</p><h1>Title</h1><p>Read <strong>this</strong> &amp; <a href="/faq">the FAQ</a>.</p>'
    + '<svg><path d="M0"/></svg><button>Go</button><a class="btn-link btn-accent" href="/register">Start free</a>'
    + '<ul><li>One</li><li>Two <a href="https://x.example/a">ext</a></li></ul>'
    + '<details><summary>Question?</summary><div class="faq-answer">Answer.</div></details>'
    + '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>x | y</td></tr></tbody></table>'
    + '<a class="home-teaser" href="/pricing"><h3>Pricing</h3><p>Plans.</p><span class="home-teaser-link">See pricing</span></a>'
    + '</section></main><footer>foot</footer>';
  const { title, body, links } = mainToMarkdown(html, BASE);
  assert.equal(title, 'Title');
  assert.match(body, /Read \*\*this\*\* & \[the FAQ\]\(https:\/\/tendertez\.in\/faq\)\./);
  assert.doesNotMatch(body, /FAQ\n|menu|foot|Go|Start free|See pricing|<|M0/);
  assert.match(body, /- One\n- Two \[ext\]\(https:\/\/x\.example\/a\)/);
  assert.match(body, /### Question\?\n\nAnswer\./);
  assert.match(body, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| x \\\| y \|/);
  assert.match(body, /### \[Pricing\]\(https:\/\/tendertez\.in\/pricing\)\n\nPlans\./);
  assert.ok(links.some((l) => l.href === '/faq'));
});

test('a markdown page has title, summary, canonical, date only when known, and absolute related links', () => {
  const md = mdPage({ title: 'T', summary: 'S.', canonical: `${BASE}/x`, body: 'Body', related: [link('FAQ', '/faq', BASE)] });
  assert.equal(md, `# T\n\n> S.\n\nCanonical: ${BASE}/x\n\nBody\n\n## Related\n- [FAQ](${BASE}/faq)\n`);
  assert.match(mdPage({ title: 'T', canonical: 'c', lastUpdated: '2026-10-24', body: 'b' }), /^Last updated: 2026-10-24$/m);
});

test('sample analysis markdown uses the stored analysis', async () => {
  const md = await renderMarkdown('/sample-analysis', { baseUrl: BASE });
  assert.match(md, /^# A real government tender, analysed by TenderTez$/m);
  assert.match(md, /AIIMS\/BBSR\/ENGG\.\/ELECT\.\/11\/2026/);
  assert.match(md, /^## Bill of quantities \(\d+ items\)$/m);
  assert.match(md, /#page=\d+\)/, 'page links into the PDF');
});

test('llms.txt: spec sections, links to the .md versions, the same facts as the site', async () => {
  const routes = await listMarkdownRoutes({ facets: async () => ({ open: { central: 0, state: 25, gem: 0 }, states: [{ name: 'Goa', count: 25 }], organisations: { central: [], gem: [] } }) });
  const txt = llmsTxt(BASE, routes);
  assert.match(txt, /^# TenderTez\n\n> TenderTez helps/);
  for (const h of ['## Core pages', '## Guides', '## Government tender lists', '## Machine-readable', '## Optional']) assert.ok(txt.includes(h), h);
  assert.ok(txt.includes(`(${BASE}/index.md)`) && txt.includes(`(${BASE}/pricing.md)`));
  assert.ok(txt.includes(`(${BASE}/government-tenders/state/goa.md)`));
  for (const g of GUIDES) assert.ok(txt.includes(`${BASE}${g.path}.md`), g.path);
  assert.ok(txt.includes(`${BASE}/llms-full.txt`) && txt.includes(`${BASE}/ai.txt`) && txt.includes(`${BASE}/api/md/_catalog`));
  assert.doesNotMatch(txt, /register/);
  for (const r of routes) assert.ok(resolve(r.path), `${r.path} is listed but has no renderer`);
});

test('ai.txt follows ADF-004 and matches llms.txt and the Organization data', () => {
  const ai = aiTxt(BASE);
  assert.equal((ai.match(/^# AI Usage Policy/gm) || []).length, 1);
  assert.match(ai, /^Website: https:\/\/tendertez\.in\/$/m);
  assert.match(ai, /^Last Updated: \d{4}-\d{2}-\d{2}$/m);
  assert.match(ai, /## Permissions\n\nAI systems MAY:\n\n- /);
  assert.match(ai, /## Restrictions\n\nAI systems MUST NOT:\n\n- /);
  const [org] = structuredData('/', BASE);
  assert.ok(ai.includes(`Email: ${org.email}`) && llmsTxt(BASE).includes(org.email));
  assert.ok(ai.includes(org.name) && llmsTxt(BASE).startsWith(`# ${org.name}`));
  for (const p of PRIVATE_PATHS) assert.ok(ai.includes(p), p);
});

test('robots.txt: AI search bots and training bots allowed on public pages, Bytespider blocked, private paths blocked for all', () => {
  const robots = robotsTxt(BASE);
  const groups = robots.split(/\n\n/).filter((g) => /User-agent:/.test(g));
  const groupOf = (bot) => groups.find((g) => g.split('\n').includes(`User-agent: ${bot}`));
  for (const bot of ['*', ...AI_SEARCH_BOTS, ...AI_TRAINING_BOTS]) {
    const g = groupOf(bot);
    assert.ok(g, bot);
    assert.match(g, /^Allow: \/$/m, bot);
    assert.doesNotMatch(g, /^Disallow: \/$/m, bot);
    for (const p of PRIVATE_PATHS) assert.ok(g.includes(`Disallow: ${p}`), `${bot} ${p}`);
  }
  assert.match(groupOf('Bytespider'), /^Disallow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/tendertez\.in\/sitemap\.xml$/m);
  for (const f of [robots, llmsTxt(BASE), aiTxt(BASE)]) assert.match(f, /keep \/robots\.txt, \/llms\.txt and \/ai\.txt in sync/);
});

test('every public page head points to its markdown version and has an ai-summary', () => {
  const head = publicPageHead(PUBLIC_PAGES['/pricing'], `${BASE}/pricing`, BASE);
  assert.ok(head.includes(`<link rel="alternate" type="text/markdown" href="${BASE}/pricing.md" />`));
  assert.match(head, /<meta name="ai-summary" content="TenderTez pricing: the first 5 tenders are free/);
  assert.ok(publicPageHead(PUBLIC_PAGES['/'], `${BASE}/`, BASE).includes(`href="${BASE}/index.md"`));
  assert.ok(publicPageHead(PUBLIC_PAGES['/faq'], `${BASE}/faq`, BASE).includes(`<meta name="ai-summary" content="${PUBLIC_PAGES['/faq'].description}" />`), 'defaults to the description');
});

test('the markdown router: suffix, negotiation, /api/md, catalog, 404, HEAD, OPTIONS, discovery files', async (t) => {
  const prerender = { html: (p) => `<html><body><main><h1>Page ${p}</h1><p>Text of ${p}.</p></main></body></html>` };
  const app = express();
  app.use(createMarkdownRouter({ baseUrl: BASE, prerender, log: { warn() {}, error() {} } }));
  app.use((_req, res) => res.type('html').send('<html>app</html>'));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  t.after(() => new Promise((r) => server.close(r)));
  const req = (path, { method = 'GET', accept } = {}) => new Promise((ok, fail) => {
    const r = http.request(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: accept ? { accept } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', fail);
    r.end();
  });

  const md = await req('/pricing.md');
  assert.equal(md.status, 200);
  assert.equal(md.headers['content-type'], 'text/markdown; charset=utf-8');
  assert.equal(md.headers['x-robots-tag'], 'noindex, follow');
  assert.equal(md.headers['content-location'], `${BASE}/pricing`);
  assert.equal(md.headers.link, `<${BASE}/pricing>; rel="canonical"`);
  assert.equal(md.headers['access-control-allow-origin'], '*');
  assert.equal(Number(md.headers['x-markdown-tokens']), Math.ceil(md.body.length / 4));
  assert.match(md.body, /^# Page \/pricing\n\n> Your first 5 tenders are free/);
  assert.match((await req('/index.md')).body, /^# Page \/\n/);
  assert.match((await req('/api/md/faq')).body, /^# Page \/faq/);
  assert.match((await req('/api/md')).body, /^# Page \/\n/);

  const neg = await req('/pricing', { accept: 'text/markdown' });
  assert.equal(neg.headers['content-type'], 'text/markdown; charset=utf-8');
  assert.match(neg.headers.vary, /Accept/);
  for (const accept of [undefined, '*/*', 'text/html', 'text/markdown, text/html']) {
    const html = await req('/pricing', { accept });
    assert.match(html.headers['content-type'], /text\/html/, String(accept));
    assert.match(html.headers.vary, /Accept/);
  }
  assert.match((await req('/dashboard', { accept: 'text/markdown' })).headers['content-type'], /text\/html/, 'app pages are never negotiated');

  for (const p of ['/does-not-exist.md', '/dashboard.md', '/api/md/insights']) {
    const nf = await req(p);
    assert.equal(nf.status, 404, p);
    assert.equal(nf.headers['content-type'], 'text/markdown; charset=utf-8', p);
    assert.match(nf.body, /^# Not found/, p);
  }

  const head = await req('/pricing.md', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['x-markdown-tokens'], md.headers['x-markdown-tokens']);
  const options = await req('/pricing.md', { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.match(options.headers['access-control-allow-methods'], /GET, HEAD, OPTIONS/);

  const catalog = JSON.parse((await req('/api/md/_catalog')).body);
  assert.ok(catalog.pages.some((p) => p.path === '/pricing' && p.markdown === `${BASE}/pricing.md` && p.url === `${BASE}/pricing`));
  const full = await req('/llms-full.txt');
  assert.equal(full.headers['content-type'], 'text/plain; charset=utf-8');
  assert.match(full.body, /^# TenderTez - full content/);
  assert.ok(full.body.includes(`<!-- source: ${BASE}/pricing -->`));
  assert.match(full.body, /<!-- source: https:\/\/tendertez\.in\/privacy-policy -->[\s\S]*$/, 'legal last');
  assert.equal((await req('/ai.txt')).headers['content-type'], 'text/plain; charset=utf-8');
  assert.match((await req('/llms.txt')).body, /^# TenderTez/);
});

const BUNDLE = new URL('../../frontend/dist-ssr/prerender.js', import.meta.url);
test('every page rendered from the real frontend bundle becomes clean markdown', { skip: !fs.existsSync(BUNDLE) && 'frontend not built' }, async () => {
  const prerender = createPrerender(BUNDLE.pathname, { log: { warn() {}, error() {} } });
  await prerender.ready;
  for (const path of prerender.paths().filter((p) => p !== '/government-tenders')) {
    const md = await renderMarkdown(path, { baseUrl: BASE, prerender });
    assert.match(md, /^# \S/, path);
    assert.doesNotMatch(md, /<[a-z][^>]*>/, `${path}: no HTML left`);
    assert.doesNotMatch(md, /\]\(\//, `${path}: every link is absolute`);
    assert.doesNotMatch(md, /Start your free trial|Start free trial/, `${path}: repeated sign-up buttons left out`);
    assert.ok(md.length > 600, `${path}: ${md.length} characters`);
  }
  const pricing = await renderMarkdown('/pricing', { baseUrl: BASE, prerender });
  assert.match(pricing, /\| Starter \| ₹3,999 \/ month \| 10 tenders a month \|/);
  assert.match(await renderMarkdown('/privacy-policy', { baseUrl: BASE, prerender }), /^Last updated: \d{4}-\d{2}-\d{2}$/m);
  assert.match(await renderMarkdown('/faq', { baseUrl: BASE, prerender }), /^### How accurate is it\?$/m);
});
