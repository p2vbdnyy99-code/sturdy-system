// Search and link-preview tags for the public pages (src/seo.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndexHtml, robotsTxt, sitemapXml, canonicalHostRedirect, PUBLIC_PAGES } from '../src/seo.js';
import { buildBidpilotConfig } from '../src/config.js';

const INDEX = '<html><head><title>TenderTez</title></head><body><div id="root"></div></body></html>';
const BASE = 'https://tendertez.in';

test('a public page gets its title, description, canonical URL and Open Graph tags', () => {
  const html = renderIndexHtml(INDEX, '/pricing', BASE);
  assert.equal((html.match(/<title>/g) || []).length, 1, 'exactly one title');
  assert.ok(html.includes(`<title>${PUBLIC_PAGES['/pricing'].title}</title>`));
  assert.ok(html.includes('<link rel="canonical" href="https://tendertez.in/pricing" />'));
  assert.ok(html.includes('<meta property="og:image" content="https://tendertez.in/og-image.png" />'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(html.includes('<div id="root"></div>'));
});

test('the home page canonical is the bare domain, and a trailing slash maps to the same page', () => {
  assert.ok(renderIndexHtml(INDEX, '/', BASE).includes('href="https://tendertez.in/"'));
  assert.ok(renderIndexHtml(INDEX, '/about/', BASE).includes('href="https://tendertez.in/about"'));
});

test('app pages, login and unknown paths are kept out of search', () => {
  for (const path of ['/dashboard', '/tenders/abc', '/login', '/settings/company', '/no-such-page']) {
    const html = renderIndexHtml(INDEX, path, BASE);
    assert.ok(html.includes('<meta name="robots" content="noindex" />'), path);
    assert.ok(html.includes('<title>TenderTez</title>'), path);
    assert.doesNotMatch(html, /og:/, path);
  }
});

test('every description is a sensible length for search results', () => {
  for (const [path, page] of Object.entries(PUBLIC_PAGES)) {
    assert.ok(page.description.length >= 70 && page.description.length <= 200, `${path}: ${page.description.length}`);
    assert.ok(page.title.length <= 60, `${path} title`);
  }
});

test('robots.txt blocks the API and app pages and points to the sitemap', () => {
  const robots = robotsTxt(BASE);
  for (const p of ['/bidpilot/', '/dashboard', '/tenders/', '/settings', '/onboarding/']) assert.ok(robots.includes(`Disallow: ${p}`), p);
  assert.ok(robots.includes('Sitemap: https://tendertez.in/sitemap.xml'));
});

test('the sitemap lists exactly the public pages', () => {
  const xml = sitemapXml(BASE);
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), Object.keys(PUBLIC_PAGES).map((p) => `${BASE}${p}`));
});

function run(mw, { method = 'GET', hostname, originalUrl = '/' }) {
  let redirected = null; let passed = false;
  mw({ method, hostname, originalUrl }, { redirect: (status, url) => { redirected = { status, url }; } }, () => { passed = true; });
  return { redirected, passed };
}

test('other hostnames get a permanent redirect to the main address, keeping the path', () => {
  const mw = canonicalHostRedirect(['www.tendertez.in', 'tendertez.com', 'www.tendertez.com'], BASE);
  assert.deepEqual(run(mw, { hostname: 'www.tendertez.com', originalUrl: '/pricing?x=1' }).redirected, { status: 301, url: 'https://tendertez.in/pricing?x=1' });
  assert.deepEqual(run(mw, { hostname: 'WWW.TenderTez.in' }).redirected, { status: 301, url: 'https://tendertez.in/' });
  assert.ok(run(mw, { hostname: 'tendertez.in' }).passed, 'the main address is served normally');
  assert.ok(run(mw, { hostname: 'tenderlytic-api.fly.dev' }).passed, 'unlisted hosts are served normally');
  assert.ok(run(mw, { method: 'POST', hostname: 'tendertez.com' }).passed, 'only page loads are redirected');
});

test('no redirect hosts configured means no redirects', () => {
  assert.ok(run(canonicalHostRedirect([], BASE), { hostname: 'www.tendertez.in' }).passed);
  assert.deepEqual(buildBidpilotConfig({}).redirectHosts, []);
  assert.deepEqual(buildBidpilotConfig({ BIDPILOT_REDIRECT_HOSTS: ' www.tendertez.in, tendertez.com ,' }).redirectHosts, ['www.tendertez.in', 'tendertez.com']);
});
