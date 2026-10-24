// Tender-search landing pages (src/landingPages.js), structured data and
// llms.txt (src/seo.js): what search engines and AI assistants are shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  landingSlug, landingPagesFrom, isLandingPath, renderLandingHtml, landingTitle, landingDescription, searchUrlFor, MIN_OPEN,
} from '../src/landingPages.js';
import { structuredData, llmsTxt, sitemapXml, renderIndexHtml } from '../src/seo.js';
import { PLANS } from '../src/bidpilot/plans.js';
import { normalizePath } from '../src/bidpilot/visits.js';
import { buildPageView } from '../src/bidpilot/ga4.js';
import { landingSlug as frontendSlug, LANDING_MIN_OPEN } from '../../frontend/src/tenders/landing.ts';
import { dbAvailable, testDb, closeTestDb, truncateAll } from './db/helpers.js';
import { publicTenders } from '../src/db/schema/index.js';

const BASE = 'https://tendertez.in';
const INDEX = '<html><head><title>TenderTez</title></head><body><div id="root"></div></body></html>';
const FACETS = {
  open: { central: 15060, state: 8899, gem: 17206 },
  states: [{ name: 'Maharashtra', count: 316 }, { name: 'Jammu and Kashmir', count: 607 }, { name: 'Sikkim', count: 1 }, { name: 'Ladakh UT', count: 11 }],
  organisations: {
    central: [{ name: 'Ministry of Railways', count: 8688 }, { name: 'E-IN-C BRANCH - MILITARY ENGINEER SERVICES', count: 1476 }, { name: 'Tiny Office', count: 3 }],
    gem: [],
  },
};

test('slugs agree with the app, and so does the minimum list size', () => {
  for (const name of ['Maharashtra', 'Jammu and Kashmir', 'Andaman & Nicobar Island', 'E-IN-C BRANCH - MILITARY ENGINEER SERVICES',
    'Central Public Works Department (CPWD)', 'NCT of Delhi', 'Dadra and Nagar Haveli (UT)']) {
    assert.equal(landingSlug(name), frontendSlug(name), name);
  }
  assert.equal(landingSlug('Central Public Works Department (CPWD)'), 'central-public-works-department-cpwd');
  assert.equal(LANDING_MIN_OPEN, MIN_OPEN);
});

test('pages exist only for lists with enough open tenders', () => {
  const pages = landingPagesFrom(FACETS);
  assert.deepEqual(pages.map((p) => p.path), [
    '/government-tenders/list/central-government',
    '/government-tenders/list/gem',
    '/government-tenders/state/maharashtra',
    '/government-tenders/state/jammu-and-kashmir',
    '/government-tenders/organisation/ministry-of-railways',
    '/government-tenders/organisation/e-in-c-branch-military-engineer-services',
  ]);
  const mes = pages.at(-1);
  assert.equal(mes.organisation, 'E-IN-C BRANCH - MILITARY ENGINEER SERVICES', 'the filter keeps the portal\'s own name');
  assert.equal(mes.label, 'E-In-C Branch - Military Engineer Services');
  assert.deepEqual(landingPagesFrom(null), []);
  assert.ok(isLandingPath('/government-tenders/state/maharashtra'));
  assert.ok(!isLandingPath('/government-tenders/state/../../etc'));
  assert.ok(!isLandingPath('/government-tenders/other/x'));
  assert.equal(searchUrlFor(pages[2]), '/government-tenders?kind=state&state=Maharashtra');
});

test('a landing page: its own head, the real list, the source and links to the others', () => {
  const pages = landingPagesFrom(FACETS);
  const page = pages[2];
  const html = renderLandingHtml(INDEX, page, [
    { kind: 'state', title: 'Road repair <at> Pune & "Nashik"', organisation: 'PWD', state: 'Maharashtra', tenderId: '2026_PWD_1_1', closingAt: '2026-10-20T06:30:00Z' },
  ], BASE, pages);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<title>Maharashtra government tenders: 316 open \| TenderTez<\/title>/);
  assert.ok(html.includes('<link rel="canonical" href="https://tendertez.in/government-tenders/state/maharashtra" />'));
  assert.doesNotMatch(html, /noindex/);
  assert.ok(html.includes('Road repair &lt;at&gt; Pune &amp; &quot;Nashik&quot;'), 'tender text is escaped');
  assert.match(html, /Closes 20 Oct 2026 · Tender ID 2026_PWD_1_1/);
  assert.match(html, /Central Public Procurement Portal \(CPPP\)/);
  assert.match(html, /Not every tender in India is listed/);
  assert.ok(html.includes('href="/government-tenders/organisation/ministry-of-railways"'));
  assert.ok(!html.includes('href="/government-tenders/state/maharashtra"'), 'no link to itself');
  for (const p of pages) {
    assert.ok(landingTitle(p).length <= 60, landingTitle(p));
    assert.ok(landingDescription(p).length <= 200, landingDescription(p));
  }
  const longOrg = { kind: 'central', label: 'Bharat Sanchar Nigam Limited (A Govt. of India Enterprise) Corporate Office', count: 1234 };
  assert.ok(landingDescription(longOrg).length < 200, 'a long organisation name keeps the description short');
  assert.match(landingDescription(longOrg), /portal links\.$/);
});

test('structured data states only published facts; llms.txt matches the plans', () => {
  const [org, site] = structuredData('/', BASE);
  assert.equal(org['@type'], 'Organization');
  assert.equal(org.founder.name, 'Sayali Londhe');
  assert.deepEqual(org.sameAs, ['https://x.com/TenderTez']);
  assert.equal(site['@type'], 'WebSite');
  const [app] = structuredData('/pricing', BASE);
  assert.deepEqual(app.offers.map((o) => [o.name, o.price, o.priceCurrency]),
    Object.values(PLANS).map((p) => [p.name, String(p.pricePerMonth), 'INR']));
  assert.deepEqual(structuredData('/faq', BASE), []);
  const html = renderIndexHtml(INDEX, '/pricing', BASE);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"SoftwareApplication"/);
  assert.doesNotMatch(renderIndexHtml(INDEX, '/about', BASE), /ld\+json/);
  const txt = llmsTxt(BASE);
  for (const p of Object.values(PLANS)) assert.ok(txt.includes(`Rs ${p.pricePerMonth.toLocaleString('en-IN')} a month for ${p.tendersPerMonth} tenders`));
  assert.match(txt, /no bid\/no-bid verdict/);
  assert.match(txt, /not every tender in India/);
  assert.match(sitemapXml(BASE, ['/government-tenders/state/maharashtra']), /<loc>https:\/\/tendertez.in\/government-tenders\/state\/maharashtra<\/loc>/);
});

test('visits and GA4 count landing pages by their own path', () => {
  assert.equal(normalizePath('/government-tenders/state/maharashtra?utm_source=linkedin'), '/government-tenders/state/maharashtra');
  const body = buildPageView({ path: '/government-tenders/state/maharashtra', source: 'direct', campaign: null, device: 'mobile', visitorId: '0123456789abcdef', day: '2026-10-16' }, BASE);
  assert.equal(body.events[0].params.page_location, 'https://tendertez.in/government-tenders/state/maharashtra');
});

const DIST = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));
const HTTP_SKIP = !dbAvailable() ? 'DATABASE_URL not set' : !fs.existsSync(DIST) ? 'frontend/dist not built' : false;

test('served by the real app: landing page, unknown slug, sitemap, llms.txt, landing API', { skip: HTTP_SKIP }, async (t) => {
  const db = testDb();
  await truncateAll();
  const soon = (d) => new Date(Date.now() + d * 86_400_000);
  await db.insert(publicTenders).values(Array.from({ length: 25 }, (_, i) => ({
    source: 'cppp', sourceKey: `lp-${i}`, kind: 'state', state: 'Goa', title: `Goa works ${i}`, tenderId: `2026_GOA_${i}_1`, closingAt: soon(2 + i),
  })));
  // CPPP's two spellings of Kerala: one list of 25, not 10 and 15.
  await db.insert(publicTenders).values(Array.from({ length: 25 }, (_, i) => ({
    source: 'cppp', sourceKey: `kl-${i}`, kind: 'state', state: i < 10 ? 'Kerala' : 'Keralam', title: `Kerala works ${i}`, closingAt: soon(2 + i),
  })));
  const { app, crawlerCounter, prerenderReady } = await import('../server.js');
  await prerenderReady;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  t.after(async () => { await new Promise((r) => server.close(r)); await truncateAll(); await closeTestDb(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, headers = {}) => new Promise((resolve, reject) => {
    http.get(`${base}${p}`, { headers }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, type: res.headers['content-type'], location: res.headers.location })); }).on('error', reject);
  });

  const page = await get('/government-tenders/state/goa');
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>Goa government tenders: 25 open \| TenderTez<\/title>/);
  assert.match(page.body, /Goa works 0/);
  assert.equal((page.body.match(/<li><strong>/g) || []).length, 25);
  const missing = await get('/government-tenders/state/atlantis');
  assert.equal(missing.status, 404);
  assert.match(missing.body, /noindex/);
  const sitemap = await get('/sitemap.xml');
  assert.match(sitemap.body, /\/government-tenders\/state\/goa<\/loc>/);
  const llms = await get('/llms.txt');
  assert.match(llms.type, /text\/plain/);
  assert.match(llms.body, /^# TenderTez/);
  const api = JSON.parse((await get('/bidpilot/public/tenders/landing')).body);
  assert.ok(api.pages.some((p) => p.path === '/government-tenders/state/goa' && p.state === 'Goa' && p.count === 25));

  const kerala = await get('/government-tenders/state/kerala');
  assert.match(kerala.body, /<title>Kerala government tenders: 25 open \| TenderTez<\/title>/);
  const keralam = await get('/government-tenders/state/keralam');
  assert.equal(keralam.status, 301);
  assert.equal(keralam.location, '/government-tenders/state/kerala');
  assert.doesNotMatch(sitemap.body, /keralam/);

  // Public pages carry their own text in the HTML when the frontend's server bundle is built.
  if (fs.existsSync(new URL('../../frontend/dist-ssr/prerender.js', import.meta.url))) {
    const guide = await get('/guides/emd-exemption');
    assert.match(guide.body, /<div id="root"><div class="home">/);
    assert.match(guide.body, /<h1>EMD exemption for MSEs and startups/);
    assert.match(guide.body, /"@type":"Article"/);
    assert.match((await get('/pricing')).body, /<div id="root"><div class="home">/);
    assert.match((await get('/dashboard')).body, /<div id="root"><\/div>/, 'app pages stay empty');
  }

  // Crawler requests are counted; a browser's are not.
  await get('/llms.txt', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.1)' });
  await get('/pricing', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.1)' });
  await get('/pricing', { 'user-agent': 'Mozilla/5.0 Chrome/126 Safari/537.36' });
  await crawlerCounter.flush();
  const hits = (await db.execute('select bot, path, hits from crawler_hits order by path')).rows;
  assert.deepEqual(hits, [{ bot: 'GPTBot (OpenAI)', path: '/llms.txt', hits: 1 }, { bot: 'GPTBot (OpenAI)', path: '/pricing', hits: 1 }]);
});
