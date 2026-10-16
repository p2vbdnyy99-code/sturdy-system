// The public sample analysis: the stored output is shown as produced (nothing
// added or reworded), arranged like the app, and served by the real app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { sampleView, renderSampleHtml, SAMPLE_PATH } from '../src/samplePage.js';
import { PUBLIC_PAGES, sitemapXml } from '../src/seo.js';
import { requirementKey } from '../src/bidpilot/repo/checklist.js';
import { normalizePath } from '../src/bidpilot/visits.js';
import { buildPageView } from '../src/bidpilot/ga4.js';
import { dbAvailable } from './db/helpers.js';

const DATA = JSON.parse(fs.readFileSync(new URL('../src/sample/aiims-bbsr-pump-motors.json', import.meta.url), 'utf8'));
const BASE = 'https://tendertez.in';
const INDEX = '<!doctype html><html><head><title>TenderTez</title></head><body><div id="root"></div></body></html>';

test('the sample shows the stored analysis as produced', () => {
  const v = sampleView();
  const a = DATA.aggregated;
  assert.equal(v.sourceUrl, 'https://aiimsbhubaneswar.nic.in/wp-content/uploads/2026/05/NIT11.pdf');
  assert.equal(v.pageCount, 35);
  // Key facts are the overview fields, word for word, with their pages.
  for (const f of v.keyFacts) {
    assert.equal(f.value, a.overview[f.key].value);
    assert.equal(f.page, a.overview[f.key].sourcePage);
  }
  assert.ok(v.keyFacts.some((f) => f.key === 'emd' && f.value === '2% of the estimated value'));
  assert.deepEqual(v.pointsToCheck.map((p) => p.text), a.redFlags.map((f) => f.description));
  assert.equal(v.boq.length, a.boq.length);
  assert.deepEqual(v.dates.map((d) => d.label), a.dates.map((d) => d.label));
  // The checklist is every distinct requirement once, documents first.
  const distinct = new Set(a.requirements.map(requirementKey)).size;
  assert.equal(v.checklistCount, distinct);
  assert.equal(v.checklist.reduce((n, g) => n + g.items.length, 0), distinct);
  assert.equal(v.checklist[0].category, 'DOCUMENT');
  // Every cited page exists in the tender.
  const pages = [...v.keyFacts, ...v.dates, ...v.pointsToCheck, ...v.boq, ...v.checklist.flatMap((g) => g.items)].map((x) => x.page);
  assert.ok(pages.every((p) => p === null || (p >= 1 && p <= 35)), 'pages within the document');
});

test('server HTML: one title, canonical, the facts, page links to the original PDF', () => {
  const html = renderSampleHtml(INDEX, BASE, PUBLIC_PAGES[SAMPLE_PATH]);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(html.includes('<link rel="canonical" href="https://tendertez.in/sample-analysis" />'));
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /<h1>Sample analysis: a real AIIMS Bhubaneswar tender<\/h1>/);
  assert.match(html, /EMD: 2% of the estimated value \(<a href="https:\/\/aiimsbhubaneswar\.nic\.in\/wp-content\/uploads\/2026\/05\/NIT11\.pdf#page=4" rel="noopener" target="_blank">page 4<\/a>\)/);
  assert.match(html, /The tender closed on 30 May 2026/);
  assert.ok(PUBLIC_PAGES[SAMPLE_PATH].title.length <= 60);
  assert.ok(PUBLIC_PAGES[SAMPLE_PATH].description.length <= 160);
  assert.match(sitemapXml(BASE), /<loc>https:\/\/tendertez.in\/sample-analysis<\/loc>/);
  assert.equal(normalizePath('/sample-analysis?utm_source=linkedin'), '/sample-analysis');
  const ga = buildPageView({ path: '/sample-analysis', source: 'direct', campaign: null, device: 'mobile', visitorId: '0123456789abcdef', day: '2026-10-16' }, BASE);
  assert.equal(ga.events[0].params.page_title, PUBLIC_PAGES[SAMPLE_PATH].title);
});

const DIST = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));

// Without a database the app answers 503 to everything, as in landing-pages.test.js.
const HTTP_SKIP = !dbAvailable() ? 'DATABASE_URL not set' : !fs.existsSync(DIST) ? 'frontend/dist not built' : false;

test('served by the real app: page and data', { skip: HTTP_SKIP }, async (t) => {
  const { app } = await import('../server.js');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => new Promise((resolve, reject) => {
    http.get(`${base}${p}`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', reject);
  });
  const page = await get('/sample-analysis');
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Sample tender analysis: AIIMS Bhubaneswar \| TenderTez<\/title>/);
  assert.match(page.body, /Points worth a second look/);
  const api = await get('/bidpilot/public/sample-analysis');
  assert.equal(api.status, 200);
  assert.match(api.headers['cache-control'], /max-age=3600/);
  assert.deepEqual(JSON.parse(api.body), JSON.parse(JSON.stringify(sampleView())));
});
