// The markdown versions of the public pages: which paths have one, and how
// each is rendered. llms.txt, llms-full.txt and /api/md/_catalog are built
// from this list, so a new public page needs exactly one step: add it here
// (test/md.test.js fails until every public route is listed or skipped).
// -----------------------------------------------------------------------------
// Pages written as React components are rendered from their own server render
// (src/prerender.js, <main> only, see htmlToMd.js). Pages built from data use
// the same data as their HTML: the sample analysis (samplePage.js sampleView),
// the tender search counts (feedFacets) and the tender lists (landingPages.js).

import { PUBLIC_PAGES, GUIDES, GUIDES_CHECKED } from '../seo.js';
import { sampleView, SAMPLE_PATH } from '../samplePage.js';
import { isLandingPath, landingMarkdown, landingPagesFrom, loadLandingPage, searchUrlFor } from '../landingPages.js';
import { mainToMarkdown } from './htmlToMd.js';
import { escapeMd, isoDate, link, list, mdPage, table, todayInIndia } from './format.js';

export class MarkdownNotFound extends Error {}
export class MarkdownUnavailable extends Error {}

const SEARCH_PATH = '/government-tenders';

/** Pages rendered from their React server render, in llms.txt order. */
const COMPONENT_PAGES = {
  core: ['/', '/features', '/pricing', '/faq', '/about', '/tender-consultants'],
  guides: ['/guides', ...GUIDES.map((g) => g.path)],
  legal: ['/privacy-policy'],
};

/** Public routes without a markdown version, and why (checked by test/md.test.js). */
export const SKIPPED = {
  '/register': 'the sign-up form; no content beyond the form',
  '/login': 'sign-in form',
  '/verify-email': 'email verification step; personal',
  '/onboarding/create-company': 'signed-in only',
  '/dashboard': 'signed-in only',
  '/tenders/:id': 'signed-in only; private company data',
  '/company-profile': 'signed-in only; private company data',
  '/clients': 'signed-in only; private company data',
  '/clients/:clientId/profile': 'signed-in only; private company data',
  '/feed': 'signed-in only',
  '/insights': "signed-in only; the founder's dashboard",
  '*': 'the not-found page',
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Last updated: 16 October 2026" as printed on a page, as YYYY-MM-DD. */
function printedDate(text) {
  const m = /Last updated:\s*(\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(text);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return month < 0 ? null : `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** The site links on a page, once each, for its "Related" list. */
function related(links, selfPath, baseUrl) {
  const seen = new Set([selfPath, '/register', '/login']);
  const out = [];
  for (const l of links) {
    if (!l.href?.startsWith('/') || !l.text) continue;
    const path = l.href.split('#')[0] || '/';
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(link(l.text, path, baseUrl));
  }
  return out.slice(0, 12);
}

const pageSummary = (path) => PUBLIC_PAGES[path]?.description ?? null;

function componentPage(path) {
  return async ({ baseUrl, prerender }) => {
    const html = prerender?.html(path);
    if (!html) throw new MarkdownUnavailable(`${path} could not be rendered right now`);
    const { title, body, links } = mainToMarkdown(html, baseUrl);
    const guide = GUIDES.find((g) => g.path === path);
    return mdPage({
      title: title || PUBLIC_PAGES[path].title,
      summary: pageSummary(path),
      canonical: `${baseUrl}${path === '/' ? '/' : path}`,
      lastUpdated: guide ? GUIDES_CHECKED : printedDate(body),
      body,
      related: related(links, path, baseUrl),
    });
  };
}

async function samplePage({ baseUrl }) {
  const v = sampleView();
  const cite = (page) => (page ? ` (${link(`p.${page}`, `${v.sourceUrl}#page=${page}`, baseUrl)})` : '');
  const body = [
    `This is what TenderTez produced for a public tender: ${escapeMd(v.about.tender)} (${v.pageCount} pages, ${link('original PDF', v.sourceUrl, baseUrl)}). `
      + 'Nothing has been edited. Each point links to the page of the PDF it came from.',
    `The tender closed on 30 May 2026; it is here only as an example. Analysed on ${isoDate(v.analysedAt)}. `
      + 'Before publishing this page we checked each quoted line against the PDF; one list that starts on page 25 continues on page 26.',
    '## Key facts',
    table(['Fact', 'Value', 'Page'], v.keyFacts.map((f) => [f.label, escapeMd(f.value), f.page ? link(`p.${f.page}`, `${v.sourceUrl}#page=${f.page}`, baseUrl) : '—'])),
    '## Dates',
    list(v.dates.map((d) => `**${escapeMd(d.label)}:** ${escapeMd(d.text)}${cite(d.page)}`)),
    `## Points worth a second look (${v.pointsToCheck.length})`,
    'Clauses that can cost a bidder money or the bid, as flagged in the analysis.',
    list(v.pointsToCheck.map((p) => `${escapeMd(p.text)}${cite(p.page)}`)),
    `## Submission checklist (${v.checklistCount} items)`,
    'Every condition and document the tender asks for, documents first.',
    ...v.checklist.flatMap((g) => [`### ${g.label} (${g.items.length})`,
      list(g.items.map((i) => `**${escapeMd(i.label)}**${i.mandatory ? '' : ' (optional)'}${cite(i.page)}${i.detail ? `: ${escapeMd(i.detail)}` : ''}`))]),
    `## Bill of quantities (${v.boq.length} items)`,
    table(['#', 'Item', 'Qty', 'Unit', 'Page'], v.boq.map((b) => [b.item ?? '—',
      escapeMd([b.description, b.specification, b.remarks].filter(Boolean).join('. ')), b.quantity ?? '—', b.unit ?? '—',
      b.page ? link(`p.${b.page}`, `${v.sourceUrl}#page=${b.page}`, baseUrl) : '—'])),
  ].join('\n\n');
  return mdPage({
    title: 'A real government tender, analysed by TenderTez',
    summary: pageSummary(SAMPLE_PATH),
    canonical: `${baseUrl}${SAMPLE_PATH}`,
    lastUpdated: isoDate(v.analysedAt),
    body,
    related: [link('Features', '/features', baseUrl), link('Pricing', '/pricing', baseUrl), link('Questions and answers', '/faq', baseUrl)],
  });
}

async function searchPage({ baseUrl, facets }) {
  const f = await facets();
  const pages = landingPagesFrom(f);
  const total = f.open.central + f.open.state + f.open.gem;
  const section = (title, items) => (items.length ? [`## ${title}`, list(items)] : []);
  const group = (kind, orgs) => pages.filter((p) => p.kind === kind && Boolean(p.organisation) === orgs)
    .map((p) => `${link(p.kind === 'gem' ? 'GeM bids' : `${p.label} tenders`, p.path, baseUrl)}: ${p.count.toLocaleString('en-IN')} open`);
  const body = [
    'Central, state and GeM tenders in one search, by state or organisation. Free, no sign-in needed.',
    `**${total.toLocaleString('en-IN')}** open tenders right now.`,
    table(['List', 'Open tenders', 'Search'], [
      ['Central government', f.open.central.toLocaleString('en-IN'), link('search', searchUrlFor({ kind: 'central' }), baseUrl)],
      ['State portals', f.open.state.toLocaleString('en-IN'), link('search', searchUrlFor({ kind: 'state' }), baseUrl)],
      ['GeM bids', f.open.gem.toLocaleString('en-IN'), link('search', searchUrlFor({ kind: 'gem' }), baseUrl)],
    ]),
    ...section('Lists by state', group('state', false)),
    ...section('Lists by organisation', group('central', true)),
    ...section('Central government and GeM lists', [...group('central', false), ...group('gem', false)]),
    'Lists with fewer than 20 open tenders are reachable through the search filters. Source: the public “latest active tenders” '
      + 'lists of the Central Public Procurement Portal (CPPP), eprocure.gov.in. Not every tender in India is listed.',
  ].join('\n\n');
  return mdPage({
    title: 'Find government tenders across India',
    summary: pageSummary(SEARCH_PATH),
    canonical: `${baseUrl}${SEARCH_PATH}`,
    lastUpdated: todayInIndia(),
    body,
    related: [link('Sample analysis of a real tender', SAMPLE_PATH, baseUrl), link('Guides', '/guides', baseUrl)],
  });
}

async function landingPage(path, { baseUrl, db, facets }) {
  const found = db ? await loadLandingPage(db(), await facets(), path) : null;
  if (!found) throw new MarkdownNotFound(path);
  return landingMarkdown(found, baseUrl);
}

/** "/pricing", "/pricing/", "/index" → the canonical path. */
export function canonicalPath(path) {
  const p = String(path || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return p === '/index' ? '/' : p;
}

/** The renderer for a path, or null when the path has no markdown version. */
export function resolve(path) {
  const p = canonicalPath(path);
  for (const paths of Object.values(COMPONENT_PAGES)) {
    if (paths.includes(p)) return componentPage(p);
  }
  if (p === SAMPLE_PATH) return samplePage;
  if (p === SEARCH_PATH) return searchPage;
  if (isLandingPath(p)) return (ctx) => landingPage(p, ctx);
  return null;
}

/** Markdown for a path; throws MarkdownNotFound or MarkdownUnavailable. */
export async function renderMarkdown(path, ctx) {
  const render = resolve(path);
  if (!render) throw new MarkdownNotFound(path);
  return render(ctx);
}

/**
 * Every addressable markdown page, grouped for llms.txt: core pages, guides,
 * tender lists (most open tenders first) and legal.
 */
export async function listMarkdownRoutes({ facets } = {}) {
  const entry = (path, group) => ({
    path, group,
    title: PUBLIC_PAGES[path]?.title.replace(/ \| TenderTez$/, '') ?? path,
    description: PUBLIC_PAGES[path]?.description ?? '',
  });
  let lists = [];
  try {
    lists = facets ? landingPagesFrom(await facets()) : [];
  } catch { lists = []; }
  return [
    ...COMPONENT_PAGES.core.map((p) => entry(p, 'core')),
    entry(SAMPLE_PATH, 'core'),
    entry(SEARCH_PATH, 'core'),
    ...COMPONENT_PAGES.guides.map((p) => entry(p, 'guides')),
    ...[...lists].sort((a, b) => b.count - a.count).map((p) => ({
      path: p.path, group: 'lists',
      title: p.kind === 'gem' ? 'GeM bids open now' : `${p.label} government tenders`,
      description: `${p.count.toLocaleString('en-IN')} open, closing soonest first, with tender IDs and portal links`,
    })),
    ...COMPONENT_PAGES.legal.map((p) => entry(p, 'legal')),
  ];
}
