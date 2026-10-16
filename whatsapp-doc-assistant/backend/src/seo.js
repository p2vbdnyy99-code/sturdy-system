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

export const PUBLIC_PAGES = {
  '/': {
    title: 'TenderTez: read a government tender in minutes',
    description: 'Upload a tender PDF from CPPP, GeM or a state portal. TenderTez finds the deadline, EMD, '
      + 'eligibility conditions, BOQ and risky clauses, each with its page number. Your first 5 tenders are free.',
  },
  '/government-tenders': {
    title: 'Find government tenders across India | TenderTez',
    description: 'Search central, state and GeM tenders in one place, by state or organisation. Free, no sign-in '
      + 'needed. Tender notices from the Central Public Procurement Portal\'s public lists.',
  },
  '/sample-analysis': {
    title: 'Sample tender analysis: AIIMS Bhubaneswar | TenderTez',
    description: 'TenderTez\u2019s real analysis of a public AIIMS Bhubaneswar tender: key facts, dates, '
      + 'eligibility, documents and risky clauses, each with its page number.',
  },
  '/features': {
    title: 'Features | TenderTez',
    description: 'Find government tenders, read a tender PDF with every point linked to its page, check '
      + 'eligibility, and track bids with a submission checklist, corrigendum check and client workspaces.',
  },
  '/pricing': {
    title: 'Pricing | TenderTez',
    description: 'Your first 5 tenders are free, with no card needed. Then monthly plans: ₹3,999 for 10 tenders, '
      + '₹5,999 for 15 or ₹8,999 for 30.',
  },
  '/faq': {
    title: 'Questions and answers | TenderTez',
    description: 'Which tenders TenderTez can read, how long an analysis takes, how accurate it is, scanned PDFs, '
      + 'eligibility checks, and who can see your documents.',
  },
  '/about': {
    title: 'About | TenderTez',
    description: 'TenderTez is built in Mumbai by founder Sayali Londhe, so deciding whether to bid on a '
      + 'government tender no longer means a full day of reading first.',
  },
  '/privacy-policy': {
    title: 'Privacy policy | TenderTez',
    description: 'What TenderTez collects, why, who it is shared with, and how to have it deleted. Your tenders '
      + 'are used only to analyse them for you, and visits are counted without cookies.',
  },
  '/register': {
    title: 'Start your free trial | TenderTez',
    description: 'Create a TenderTez account and analyse your first 5 tenders free. No card needed.',
  },
};

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
    // "<" is escaped so the JSON can never close the element early.
    ...jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

/** index.html with this path's head tags in place of the plain <title>. */
export function renderIndexHtml(indexHtml, path, baseUrl) {
  const page = PUBLIC_PAGES[normalizePath(path)];
  if (!page) {
    return indexHtml.replace('</title>', '</title>\n    <meta name="robots" content="noindex" />');
  }
  const url = `${baseUrl}${normalizePath(path) === '/' ? '/' : normalizePath(path)}`;
  const tags = publicPageHead(page, url, baseUrl, structuredData(normalizePath(path), baseUrl));
  return indexHtml.replace(/<title>[^<]*<\/title>/, tags);
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

export function sitemapXml(baseUrl, extraPaths = []) {
  const urls = [...Object.keys(PUBLIC_PAGES), ...extraPaths]
    .map((p) => `  <url><loc>${escapeHtml(`${baseUrl}${p}`)}</loc></url>`)
    .join('\n');
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
