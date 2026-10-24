// What search engines and link previews see for the TenderTez website.
// -----------------------------------------------------------------------------
// The frontend is a single-page app: every URL gets the same index.html, whose
// only head content is "<title>TenderTez</title>". Google can run the app, but
// WhatsApp, LinkedIn and other link previews only read the HTML, so the public
// pages get their own title, description, canonical URL and Open Graph tags
// here, written into index.html as it is served. Signed-in app pages and
// anything unknown are marked noindex so they never appear in search.
// The descriptions only state what the public pages themselves say.

import { PLANS } from './bidpilot/plans.js';

const SITE_NAME = 'TenderTez';
const CONTACT_EMAIL = 'advayaicopilot@gmail.com';
// The official X account (frontend/src/config/site.ts has the same).
const X_HANDLE = 'TenderTez';

export const PUBLIC_PAGES = {
  '/': {
    title: 'AI tender analysis for Indian government tenders | TenderTez',
    description: 'TenderTez reads a government tender PDF and lists the deadline, EMD, eligibility, BOQ and risky '
      + 'clauses, each with its page number. First 5 tenders free.',
  },
  '/government-tenders': {
    title: 'Find government tenders across India | TenderTez',
    description: 'Search central, state and GeM tenders in one place, by state or organisation. Free, no sign-in. '
      + 'From the Central Public Procurement Portal\u2019s public lists.',
  },
  '/sample-analysis': {
    title: 'Sample tender analysis: AIIMS Bhubaneswar | TenderTez',
    description: 'TenderTez\u2019s real analysis of a public AIIMS Bhubaneswar tender: key facts, dates, '
      + 'eligibility, documents and risky clauses, each with its page number.',
  },
  '/features': {
    title: 'Tender analysis features: eligibility, checklist | TenderTez',
    description: 'Read a tender PDF with every point linked to its page, check eligibility against your company, '
      + 'get a submission checklist, check corrigenda and track bids.',
  },
  '/pricing': {
    title: 'Pricing: 5 tenders free, then ₹3,999 a month | TenderTez',
    description: 'Your first 5 tenders are free, no card needed. Then ₹3,999 a month for 10 tenders, ₹5,999 for 15 '
      + 'or ₹8,999 for 30. Nothing is charged automatically.',
  },
  '/faq': {
    title: 'Tender analysis FAQ: accuracy, scans, privacy | TenderTez',
    description: 'How accurate TenderTez is, how long an analysis takes, scanned and Hindi PDFs, the eligibility '
      + 'check, and who can see your tender documents.',
  },
  '/about': {
    title: 'About TenderTez: AI tender reading, built in Mumbai',
    description: 'TenderTez is an AI tender-reading tool built in Mumbai by Sayali Londhe for Indian contractors, '
      + 'suppliers and tender consultants.',
  },
  '/privacy-policy': {
    title: 'Privacy policy | TenderTez',
    description: 'What TenderTez collects, why, who it is shared with and how to delete it. Tenders are used only '
      + 'to analyse them for you; visits are counted without cookies.',
  },
  '/register': {
    title: 'Start your free trial | TenderTez',
    description: 'Create a TenderTez account and analyse your first 5 tenders free. No card needed.',
  },
  '/guides': {
    title: 'Guides to reading Indian government tenders | TenderTez',
    description: 'Guides to reading Indian government tenders: checking eligibility, claiming EMD exemption and '
      + 'finding what a corrigendum changed, with the sources quoted.',
  },
};

/**
 * The guides (frontend/src/guides/guides.ts has the same slugs, headlines and
 * date; tested). Each quotes only its sources, read in full on GUIDES_CHECKED.
 */
export const GUIDES_CHECKED = '2026-10-24';
export const GUIDES = [
  {
    path: '/guides/tender-eligibility-check',
    headline: 'How to check eligibility in a government tender',
    title: 'How to check eligibility in a government tender',
    description: 'Check turnover, similar-work experience, registrations and exemptions in a government tender, '
      + 'clause by clause, before you spend on a bid.',
    citations: [
      'https://prasarbharati.gov.in/wp-content/uploads/2024/04/Engineering_673527.pdf',
      'https://www.rri.res.in/sites/default/files/2024-08/GeM-Bidding-5263261.pdf',
      'https://www.iitk.ac.in/iwd/file/2026/06-Civil-D2-2026-27/Corrigendum.pdf',
    ],
  },
  {
    path: '/guides/emd-exemption',
    headline: 'EMD exemption for MSEs and startups: who qualifies and how to claim it',
    title: 'EMD exemption for MSEs and startups: who qualifies',
    description: 'GFR Rule 170 exempts MSEs and DPIIT-recognised startups from EMD. On GeM, traders are excluded '
      + 'and proof must be uploaded with the bid.',
    citations: [
      'https://dgll.nic.in/sites/default/files/2023-06/GFR%20amendment2.pdf',
      'https://www.rri.res.in/sites/default/files/2024-08/GeM-Bidding-5263261.pdf',
      'https://doe.gov.in/files/circulars_document/Bid_Security_Earnest_Money_Deposit.pdf',
    ],
  },
  {
    path: '/guides/tender-corrigendum',
    headline: 'What a tender corrigendum can change, and how to check it',
    title: 'Tender corrigendum: what it changes and how to check',
    description: 'A corrigendum can change the deadline, EMD, eligibility or scope after you have read a tender. '
      + 'How to find every corrigendum and check what changed.',
    citations: ['https://www.iitk.ac.in/iwd/file/2026/06-Civil-D2-2026-27/Corrigendum.pdf'],
  },
];
for (const g of GUIDES) PUBLIC_PAGES[g.path] = { title: g.title, description: g.description };

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function normalizePath(path) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * Structured data (schema.org JSON-LD) for the home and pricing pages: who
 * runs the site, and the product with its published plans. Only facts the
 * site itself states. A JSON-LD block is data, not a script, so the strict
 * Content-Security-Policy doesn't block it.
 */
export function structuredData(path, baseUrl) {
  const guide = GUIDES.find((g) => g.path === path);
  if (guide) {
    const publisher = { '@type': 'Organization', name: SITE_NAME, url: `${baseUrl}/` };
    return [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.headline,
      description: guide.description,
      dateModified: GUIDES_CHECKED,
      author: publisher,
      publisher,
      mainEntityOfPage: `${baseUrl}${guide.path}`,
      citation: guide.citations,
    }, {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${baseUrl}/guides` },
        { '@type': 'ListItem', position: 3, name: guide.headline, item: `${baseUrl}${guide.path}` },
      ],
    }];
  }
  if (path === '/') {
    return [{
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${baseUrl}/`,
      logo: `${baseUrl}/og-image.png`,
      email: CONTACT_EMAIL,
      founder: { '@type': 'Person', name: 'Sayali Londhe' },
      address: { '@type': 'PostalAddress', addressLocality: 'Mumbai', addressCountry: 'IN' },
      sameAs: [`https://x.com/${X_HANDLE}`],
    }, {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${baseUrl}/`,
    }];
  }
  if (path === '/pricing') {
    return [{
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: `${baseUrl}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      description: PUBLIC_PAGES['/'].description,
      offers: Object.values(PLANS).map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: String(plan.pricePerMonth),
        priceCurrency: 'INR',
        description: `${plan.tendersPerMonth} tenders a month`,
        url: `${baseUrl}/pricing`,
      })),
    }];
  }
  return [];
}

/** The head tags for a public page (title, description, canonical, Open Graph). */
export function publicPageHead(page, url, baseUrl, jsonLd = []) {
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(`${baseUrl}/og-image.png`)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="TenderTez: read a government tender in minutes" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@${X_HANDLE}" />`,
    // "<" is escaped so the JSON can never close the element early.
    ...jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

/**
 * index.html with this path's head tags in place of the plain <title>, and
 * for a public page its server-rendered body (src/prerender.js) inside #root,
 * when `bodyFor` has one.
 */
export function renderIndexHtml(indexHtml, path, baseUrl, bodyFor = () => null) {
  const p = normalizePath(path);
  const page = PUBLIC_PAGES[p];
  if (!page) {
    return indexHtml.replace('</title>', '</title>\n    <meta name="robots" content="noindex" />');
  }
  const url = `${baseUrl}${p === '/' ? '/' : p}`;
  const tags = publicPageHead(page, url, baseUrl, structuredData(p, baseUrl));
  const body = bodyFor(p);
  const html = indexHtml.replace(/<title>[^<]*<\/title>/, tags);
  return body ? html.replace('<div id="root"></div>', `<div id="root">${body}</div>`) : html;
}

/**
 * /llms.txt: a plain summary of the site for AI assistants that look for one
 * (a proposed convention, not a standard; nothing guarantees it is read).
 * Only what the public pages say.
 */
export function llmsTxt(baseUrl) {
  const plans = Object.values(PLANS).map((p) => `- ${p.name}: Rs ${p.pricePerMonth.toLocaleString('en-IN')} a month for ${p.tendersPerMonth} tenders`).join('\n');
  return [
    '# TenderTez',
    '',
    '> TenderTez helps Indian businesses and tender consultants read government tender documents (CPPP, GeM, state portals, PSUs). '
      + 'Upload a tender PDF and it lists the deadline, EMD, fees, eligibility conditions, required documents, BOQ items, dates and risky clauses, '
      + 'each with the page number it came from.',
    '',
    'Built in Mumbai by founder Sayali Londhe. Contact: ' + CONTACT_EMAIL,
    '',
    '## What it does',
    '- Reads a tender PDF, including scanned pages, and lists every condition, document and date with its page and quoted text',
    '- Eligibility check against the company profile (meets / does not appear to meet / unknown, with the reason); no bid/no-bid verdict',
    '- Submission checklist built from the tender\u2019s own requirements, downloadable as Excel',
    '- Corrigendum check: what an amendment changed, quoted with its page',
    '- Annexure drafts: the tender\u2019s own forms filled from the profile as Word files; price bids and BOQs are never drafted',
    '- Bid tracker with EMD and bank-guarantee records; client workspaces for consultants',
    '- Free public search of central, state and GeM tenders from CPPP\u2019s public lists (not every tender in India)',
    '',
    '## Pricing',
    '- First 5 tenders free, no card needed',
    plans,
    '',
    '## Pages',
    ...Object.entries(PUBLIC_PAGES).map(([path, page]) => `- [${page.title}](${baseUrl}${path}): ${page.description}`),
    '',
  ].join('\n');
}

export function robotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Disallow: /bidpilot/',
    'Disallow: /dashboard',
    'Disallow: /tenders/',
    'Disallow: /company-profile',
    'Disallow: /onboarding/',
    'Disallow: /verify-email',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * The sitemap. `<lastmod>` only where it is true: the guides carry the date
 * their sources were checked, and the tender lists (`extraPaths`) change
 * every day, so they carry today's date in India. Other pages have none.
 */
export function sitemapXml(baseUrl, extraPaths = [], now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const guidePaths = new Set(GUIDES.map((g) => g.path));
  const entry = (p, lastmod) => `  <url><loc>${escapeHtml(`${baseUrl}${p}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  const urls = [
    ...Object.keys(PUBLIC_PAGES).map((p) => entry(p, guidePaths.has(p) ? GUIDES_CHECKED : null)),
    ...extraPaths.map((p) => entry(p, today)),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Sends www and other domains to the one main address with a permanent
 * redirect, so search engines see a single site. Only page loads (GET/HEAD)
 * are redirected; anything else passes through untouched.
 */
export function canonicalHostRedirect(redirectHosts, baseUrl) {
  const hosts = new Set(redirectHosts.map((h) => h.toLowerCase()));
  return (req, res, next) => {
    if (!hosts.size || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    if (!hosts.has(String(req.hostname || '').toLowerCase())) return next();
    return res.redirect(301, `${baseUrl}${req.originalUrl}`);
  };
}
