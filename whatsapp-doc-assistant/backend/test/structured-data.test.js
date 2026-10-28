// Structured data added 28 Oct 2026: FAQPage read from a page's own server
// HTML, Organization on /about, the consultants page, and breadcrumbs on the
// tender lists. JSON-LD may only repeat what the page shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { faqFromHtml, structuredData, renderIndexHtml, PUBLIC_PAGES } from '../src/seo.js';
import { renderLandingHtml } from '../src/landingPages.js';
import { normalizePath } from '../src/bidpilot/visits.js';
import { createPrerender } from '../src/prerender.js';

const BASE = 'https://tendertez.in';
const INDEX = '<html><head><title>TenderTez</title></head><body><div id="root"></div></body></html>';
const BUNDLE = new URL('../../frontend/dist-ssr/prerender.js', import.meta.url);
const jsonLdIn = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('faqFromHtml reads questions and answers as plain text', () => {
  const html = '<details class="faq-item"><summary>Can I <!-- -->try it?</summary>'
    + '<div class="faq-answer">Yes, it&rsquo;s free. <a href="/register">Start</a> now.</div></details>'
    + '<details class="other"><summary>Not an FAQ</summary><p>x</p></details>';
  assert.deepEqual(faqFromHtml(html), [{ q: 'Can I try it?', a: 'Yes, it’s free. Start now.' }]);
  assert.deepEqual(faqFromHtml(''), []);
});

test('no FAQPage without FAQ items in the page; Organization on /about matches the home page', () => {
  assert.deepEqual(structuredData('/faq', BASE), []);
  const [homeOrg] = structuredData('/', BASE);
  assert.deepEqual(structuredData('/about', BASE), [homeOrg]);
});

test('the consultants page is public, counted, and has WebPage and breadcrumb data', () => {
  assert.ok(PUBLIC_PAGES['/tender-consultants']);
  assert.ok(PUBLIC_PAGES['/tender-consultants'].title.length <= 60);
  assert.ok(PUBLIC_PAGES['/tender-consultants'].description.length <= 160);
  assert.equal(normalizePath('/tender-consultants'), '/tender-consultants');
  const [page, crumbs] = structuredData('/tender-consultants', BASE);
  assert.equal(page['@type'], 'WebPage');
  assert.equal(page.url, `${BASE}/tender-consultants`);
  assert.deepEqual(crumbs.itemListElement.map((i) => i.item), [`${BASE}/`, `${BASE}/tender-consultants`]);
});

test('a tender list carries Home > Find government tenders > the list', () => {
  const page = { path: '/government-tenders/state/goa', kind: 'state', state: 'Goa', organisation: '', label: 'Goa', count: 25 };
  const html = renderLandingHtml(INDEX, page, [], BASE, [page]);
  const [crumbs] = jsonLdIn(html);
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'Home', `${BASE}/`],
    [2, 'Find government tenders', `${BASE}/government-tenders`],
    [3, 'Goa government tenders', `${BASE}/government-tenders/state/goa`],
  ]);
  assert.match(html, /<h1>Goa government tenders<\/h1>/, 'the last crumb is the page’s own heading');
});

test('FAQPage on /faq and /tender-consultants repeats every question on the page, and nothing else',
  { skip: !fs.existsSync(BUNDLE) && 'frontend not built' }, async () => {
    const pre = createPrerender(BUNDLE.pathname);
    await pre.ready;
    for (const path of ['/faq', '/tender-consultants']) {
      const body = pre.html(path);
      const html = renderIndexHtml(INDEX, path, BASE, (p) => pre.html(p));
      const faq = jsonLdIn(html).find((d) => d['@type'] === 'FAQPage');
      assert.ok(faq, `${path} has FAQPage`);
      const summaries = [...body.matchAll(/<details[^>]*class="faq-item"[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>/g)]
        .map((m) => m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim());
      assert.equal(faq.mainEntity.length, summaries.length, path);
      for (const qa of faq.mainEntity) {
        assert.ok(qa.name && qa.acceptedAnswer.text, path);
        assert.doesNotMatch(qa.name + qa.acceptedAnswer.text, /<|&[a-z]+;/, 'plain text only');
      }
    }
    const consultants = jsonLdIn(renderIndexHtml(INDEX, '/tender-consultants', BASE, (p) => pre.html(p)))
      .find((d) => d['@type'] === 'FAQPage');
    assert.ok(consultants.mainEntity.some((qa) => /optional for your first 3 tenders/.test(qa.acceptedAnswer.text)),
      'the profile rule reads from the shared number (3)');
  });
