// Landing pages for the public tender search, so a contractor searching
// Google for "Maharashtra government tenders" or "MES tenders" can find the
// real, current list (Oct 2026).
// -----------------------------------------------------------------------------
// One page per state and per large central organisation with open tenders,
// plus the central and GeM lists, at /government-tenders/<group>/<slug>.
// Each page is the real list:
// - its own title, description and canonical URL;
// - a server-rendered list of the tenders closing soonest (crawlable before
//   the app loads);
// - CPPP credited as the source, and the plain note that it is not every
//   tender;
// - links to the other lists.
// No page is made for a list below MIN_OPEN tenders, so there are no thin
// pages. The browser app then takes over the same URL
// (GovernmentTendersPage reads the filter from GET /public/tenders/landing).

import { publicPageHead } from './seo.js';
import { STATE_ALIASES, searchFeed } from './bidpilot/repo/publicTenders.js';
import { escapeMd, link, list, mdPage, todayInIndia } from './md/format.js';

export const MIN_OPEN = 20;
export const MAX_ORGANISATIONS = 20;
export const LIST_SIZE = 25;

/** Must match frontend/src/tenders/landing.ts landingSlug (tested). */
export function landingSlug(name) {
  return String(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Title-case a CPPP organisation name for headings ("E-IN-C BRANCH - MILITARY ..." stays readable). */
function displayName(name) {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The|For)\b/g, (w) => w.toLowerCase());
}

/**
 * The landing pages that exist right now, from the search facets.
 * @returns {Array<{ path, kind, state, organisation, label, count }>}
 */
export function landingPagesFrom(facets) {
  const pages = [];
  if (!facets) return pages;
  if ((facets.open?.central ?? 0) >= MIN_OPEN) {
    pages.push({ path: '/government-tenders/list/central-government', kind: 'central', state: '', organisation: '', label: 'Central government', count: facets.open.central });
  }
  if ((facets.open?.gem ?? 0) >= MIN_OPEN) {
    pages.push({ path: '/government-tenders/list/gem', kind: 'gem', state: '', organisation: '', label: 'GeM', count: facets.open.gem });
  }
  for (const s of facets.states ?? []) {
    if (s.count < MIN_OPEN || !landingSlug(s.name)) continue;
    pages.push({ path: `/government-tenders/state/${landingSlug(s.name)}`, kind: 'state', state: s.name, organisation: '', label: s.name, count: s.count });
  }
  for (const o of (facets.organisations?.central ?? []).slice(0, MAX_ORGANISATIONS)) {
    if (o.count < MIN_OPEN || !landingSlug(o.name)) continue;
    pages.push({ path: `/government-tenders/organisation/${landingSlug(o.name)}`, kind: 'central', state: '', organisation: o.name, label: displayName(o.name), count: o.count });
  }
  // Two names can slug alike; keep the first.
  const seen = new Set();
  return pages.filter((p) => (seen.has(p.path) ? false : seen.add(p.path)));
}

/** Where an old state spelling's page now lives (a 301), or null. */
export function landingRedirect(path) {
  for (const [alias, main] of Object.entries(STATE_ALIASES)) {
    if (path === `/government-tenders/state/${landingSlug(alias)}`) return `/government-tenders/state/${landingSlug(main)}`;
  }
  return null;
}

export function isLandingPath(path) {
  return /^\/government-tenders\/(list|state|organisation)\/[a-z0-9-]{1,80}$/.test(path);
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function istDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

export function landingTitle(page) {
  const base = page.kind === 'gem' ? 'GeM bids open now' : `${page.label} government tenders`;
  const withCount = `${base}: ${page.count.toLocaleString('en-IN')} open`;
  return `${withCount.length <= 46 ? withCount : base} | TenderTez`.slice(0, 60);
}

export function landingDescription(page) {
  const what = page.kind === 'gem' ? 'GeM bids' : page.kind === 'state' ? `tenders in ${page.label}` : `${page.label} tenders`;
  const first = `${page.count.toLocaleString('en-IN')} open ${what}, closing soonest first, with tender IDs and portal links.`;
  const full = `${first} Free search, updated daily from CPPP’s public lists.`;
  // Search results cut descriptions at about 160 characters; long organisation names keep the first sentence only.
  return full.length <= 160 ? full : first;
}

/** The search URL with this page's filters (what the app shows). */
export function searchUrlFor(page) {
  const p = new URLSearchParams();
  if (page.kind !== 'all') p.set('kind', page.kind);
  if (page.state) p.set('state', page.state);
  if (page.organisation) p.set('org', page.organisation);
  return `/government-tenders?${p.toString()}`;
}

/**
 * index.html with this landing page's head tags and a server-rendered list
 * inside #root (the app replaces it when it starts).
 */
export function renderLandingHtml(indexHtml, page, tenders, baseUrl, allPages) {
  const head = publicPageHead({ title: landingTitle(page), description: landingDescription(page) }, `${baseUrl}${page.path}`, baseUrl);
  const heading = page.kind === 'gem' ? 'GeM bids open now' : `${page.label} government tenders`;
  const rows = tenders.map((t) => {
    const who = [t.organisation, t.department && t.department !== t.organisation ? t.department : null, t.state].filter(Boolean).join(' · ');
    const closes = istDate(t.closingAt);
    return `<li><strong>${esc(t.title)}</strong>${who ? `<br>${esc(who)}` : ''}`
      + `${closes ? `<br>Closes ${esc(closes)}` : ''}${t.tenderId ? ` · ${t.kind === 'gem' ? 'Bid number' : 'Tender ID'} ${esc(t.tenderId)}` : ''}</li>`;
  }).join('');
  const others = allPages.filter((p) => p.path !== page.path)
    .map((p) => `<li><a href="${esc(p.path)}">${esc(p.kind === 'gem' ? 'GeM bids' : `${p.label} tenders`)}</a> (${p.count.toLocaleString('en-IN')})</li>`).join('');
  const body = `<main><h1>${esc(heading)}</h1>`
    + `<p>${page.count.toLocaleString('en-IN')} open tenders right now, closing soonest first. Search them free, without signing up, at `
    + `<a href="${esc(searchUrlFor(page))}">TenderTez tender search</a>. Each tender links to its portal&rsquo;s search page with the ID to look for.</p>`
    + `<ol>${rows}</ol>`
    + '<p>Source: the public &ldquo;latest active tenders&rdquo; lists of the Central Public Procurement Portal (CPPP), eprocure.gov.in. '
    + 'Not every tender in India is listed.</p>'
    + '<p>Found one worth bidding for? Upload its PDF to TenderTez to see every eligibility condition, document, date and EMD with its page number. '
    + '<a href="/register">Your first 5 tenders are free</a>.</p>'
    + `<h2>Other lists</h2><ul>${others}</ul></main>`;
  return indexHtml
    .replace(/<title>[^<]*<\/title>/, head)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

/**
 * The landing page at `path` with its list (closing soonest first), or null
 * when no such page exists right now. Shared by the HTML and markdown versions.
 */
export async function loadLandingPage(db, facets, path) {
  const pages = landingPagesFrom(facets);
  const page = pages.find((p) => p.path === path);
  if (!page) return null;
  const { tenders } = await searchFeed(db, {
    kind: page.kind, state: page.state, organisation: page.organisation, search: '',
    status: 'open', sort: 'closing', page: 1, limit: LIST_SIZE,
  });
  return { page, tenders, pages };
}

/** The markdown version of a landing page: the same list and notes as its HTML. */
export function landingMarkdown({ page, tenders, pages }, baseUrl, now = new Date()) {
  const heading = page.kind === 'gem' ? 'GeM bids open now' : `${page.label} government tenders`;
  const rows = tenders.map((t) => {
    const who = [t.organisation, t.department && t.department !== t.organisation ? t.department : null, t.state].filter(Boolean).join(' · ');
    const closes = istDate(t.closingAt);
    const id = t.tenderId ? `${t.kind === 'gem' ? 'Bid number' : 'Tender ID'} ${t.tenderId}` : null;
    return [`**${escapeMd(t.title)}**`, who && escapeMd(who), [closes && `Closes ${closes}`, id && escapeMd(id)].filter(Boolean).join(' · ')]
      .filter(Boolean).join('  \n   ');
  });
  const body = [
    `${page.count.toLocaleString('en-IN')} open tenders right now, closing soonest first. Search them free, without signing up, at `
      + `${link('TenderTez tender search', searchUrlFor(page), baseUrl)}. Each tender links to its portal\u2019s search page with the ID to look for.`,
    `## The ${tenders.length} closing soonest`,
    list(rows, true),
    'Source: the public \u201clatest active tenders\u201d lists of the Central Public Procurement Portal (CPPP), eprocure.gov.in. '
      + 'Not every tender in India is listed.',
  ].join('\n\n');
  return mdPage({
    title: heading,
    summary: landingDescription(page),
    canonical: `${baseUrl}${page.path}`,
    lastUpdated: todayInIndia(now),
    body,
    related: pages.filter((p) => p.path !== page.path)
      .map((p) => `${link(p.kind === 'gem' ? 'GeM bids' : `${p.label} tenders`, p.path, baseUrl)} (${p.count.toLocaleString('en-IN')} open)`),
  });
}

/** A per-path cache of rendered pages, so crawlers don't hit the database on every request. */
export function createLandingCache(ttlMs = 10 * 60 * 1000) {
  const cache = new Map();
  return {
    get(key) {
      const hit = cache.get(key);
      return hit && Date.now() - hit.at < ttlMs ? hit.html : null;
    },
    set(key, html) {
      if (cache.size > 500) cache.clear();
      cache.set(key, { html, at: Date.now() });
    },
  };
}
