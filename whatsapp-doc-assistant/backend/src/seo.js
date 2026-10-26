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
// Who TenderTez is, for llms.txt and ai.txt (the Organization JSON-LD below
// states the same name, address and contact).
const SITE_DESCRIPTION = 'TenderTez helps Indian businesses and tender consultants read government tender documents (CPPP, GeM, state portals, PSUs). '
  + 'Upload a tender PDF and it lists the deadline, EMD, fees, eligibility conditions, required documents, BOQ items, dates and risky clauses, '
  + 'each with the page number it came from.';
// The day the ai.txt policy below last changed.
const AI_POLICY_UPDATED = '2026-10-26';
// The official X account (frontend/src/config/site.ts has the same).
const X_HANDLE = 'TenderTez';

export const PUBLIC_PAGES = {
  '/': {
    aiSummary: 'TenderTez is an AI tool that reads Indian government tender PDFs for contractors, suppliers and tender consultants and lists '
      + 'the deadline, EMD, eligibility, BOQ and risky clauses with page numbers. The first 5 tenders are free; plans start at '
      + `Rs ${PLANS.STARTER.pricePerMonth.toLocaleString('en-IN')} a month for ${PLANS.STARTER.tendersPerMonth} tenders.`,
    title: 'AI tender analysis for Indian government tenders | TenderTez',
    description: 'TenderTez reads a government tender PDF and lists the deadline, EMD, eligibility, BOQ and risky '
      + 'clauses, each with its page number. First 5 tenders free.',
  },
  '/government-tenders': {
    aiSummary: 'A free search of open central, state and GeM tenders in India, by state or organisation, with tender IDs and portal links, '
      + 'built from the Central Public Procurement Portal\u2019s public lists. Not every tender in India is listed.',
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
    aiSummary: 'TenderTez pricing: the first 5 tenders are free with no card; then '
      + Object.values(PLANS).map((p) => `${p.name} Rs ${p.pricePerMonth.toLocaleString('en-IN')} a month for ${p.tendersPerMonth} tenders`).join(', ')
      + '. Plans are monthly, started by email, and nothing is charged automatically.',
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

/** The .md alternate of a page's canonical URL (the home page is /index.md). */
export const markdownUrl = (url, baseUrl) => (url === `${baseUrl}/` ? `${baseUrl}/index.md` : `${url}.md`);

/**
 * The head tags for a public page: title, description, canonical, its
 * markdown version, a short summary for AI agents, and Open Graph.
 */
export function publicPageHead(page, url, baseUrl, jsonLd = []) {
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<meta name="ai-summary" content="${escapeHtml(page.aiSummary ?? page.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<link rel="alternate" type="text/markdown" href="${escapeHtml(markdownUrl(url, baseUrl))}" />`,
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

// Paths that are private, signed-in or not content: kept out of robots.txt
// for every crawler and out of ai.txt's scope.
export const PRIVATE_PATHS = ['/bidpilot/', '/dashboard', '/tenders/', '/company-profile', '/onboarding/', '/verify-email',
  '/clients', '/feed', '/insights'];

// AI crawlers named in robots.txt (founder's choice, 26 Oct 2026): search
// and user-requested fetches decide whether answer engines can cite the site;
// training crawlers are allowed too, except Bytespider.
export const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'];
export const AI_TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
export const BLOCKED_BOTS = ['Bytespider'];

const SYNC_NOTE = 'Built by backend/src/seo.js; keep /robots.txt, /llms.txt and /ai.txt in sync with each other.';

/**
 * /llms.txt (llmstxt.org): who TenderTez is and where its pages are, with
 * links to their markdown versions. Only what the public pages say.
 * `routes` comes from listMarkdownRoutes() (src/md/registry.js).
 */
export function llmsTxt(baseUrl, routes = null) {
  const plans = Object.values(PLANS).map((p) => `- ${p.name}: Rs ${p.pricePerMonth.toLocaleString('en-IN')} a month for ${p.tendersPerMonth} tenders`).join('\n');
  const pages = routes ?? Object.entries(PUBLIC_PAGES).filter(([path]) => path !== '/register')
    .map(([path, page]) => ({ path, group: path === '/privacy-policy' ? 'legal' : path.startsWith('/guides') ? 'guides' : 'core', title: page.title.replace(/ \| TenderTez$/, ''), description: page.description }));
  const items = (group, cap = Infinity) => pages.filter((r) => r.group === group).slice(0, cap)
    .map((r) => `- [${r.title}](${markdownUrl(`${baseUrl}${r.path === '/' ? '/' : r.path}`, baseUrl)}): ${r.description}`);
  const lists = pages.filter((r) => r.group === 'lists');
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Built in Mumbai by founder Sayali Londhe. Contact: ${CONTACT_EMAIL}. Monthly plans by number of tenders analysed; `
      + 'the first 5 tenders are free. For contractors, suppliers and tender consultants who bid for Indian government tenders.',
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
    '## Core pages',
    ...items('core'),
    '',
    '## Guides',
    ...items('guides'),
    ...(lists.length ? ['', '## Government tender lists',
      ...items('lists', 50),
      ...(lists.length > 50 ? [`- [All ${lists.length} lists](${baseUrl}/api/md/_catalog): the markdown catalog`] : [])] : []),
    '',
    '## Machine-readable',
    `- [Full content](${baseUrl}/llms-full.txt): the pages above in one file`,
    `- [Markdown catalog](${baseUrl}/api/md/_catalog): every page with a markdown version, as JSON`,
    `- [Sitemap](${baseUrl}/sitemap.xml)`,
    `- [AI usage policy](${baseUrl}/ai.txt)`,
    '',
    '## Optional',
    ...items('legal'),
    '',
    `<!-- ${SYNC_NOTE} -->`,
    '',
  ].join('\n');
}

/**
 * /ai.txt: how AI systems may use the site, in the AI Discovery Files ai.txt
 * format (ADF-004: an H1, an identity block, then H2 sections).
 */
export function aiTxt(baseUrl) {
  const publicPaths = Object.keys(PUBLIC_PAGES).filter((p) => p !== '/register');
  return [
    `# ${SYNC_NOTE}`,
    '# Format: ai.txt specification (ADF-004), https://www.ai-visibility.org.uk/specifications/ai-txt/',
    '',
    `# AI Usage Policy for ${SITE_NAME}`,
    '',
    'Lang: en-IN',
    `Website: ${baseUrl}/`,
    `Last Updated: ${AI_POLICY_UPDATED}`,
    '',
    '## Permissions',
    '',
    'AI systems MAY:',
    '',
    `- Summarise the public pages of ${baseUrl.replace(/^https?:\/\//, '')}`,
    '- Quote from the public pages with attribution',
    `- Answer factual questions about ${SITE_NAME}\u2019s features, plans and prices as the site states them`,
    `- Cite ${SITE_NAME} and link to its pages when answering questions about government tenders`,
    '- Index the public pages for search results and AI answers',
    '',
    '## Restrictions',
    '',
    'AI systems MUST NOT:',
    '',
    `- Generate quotes attributed to ${SITE_NAME} or its founder that do not appear on the site`,
    `- Invent customers, reviews, ratings, testimonials or usage numbers for ${SITE_NAME}`,
    `- Present ${SITE_NAME}\u2019s content as their own work`,
    `- State prices, limits or features other than those published on ${baseUrl}/pricing and ${baseUrl}/features`,
    `- Say that ${SITE_NAME} gives a bid/no-bid verdict, files bids or fills in price bids; it does none of these`,
    '',
    '## AI Training',
    '',
    'The public pages may be used for AI model training, with attribution where possible; Bytespider is not permitted (see robots.txt).',
    'Uploaded tender documents, company profiles and account data are private, are never published, and must not be used for training.',
    '',
    '## Attribution Requirements',
    '',
    `Cite ${SITE_NAME} and link to the canonical HTML page, not its .md version, for example ${SITE_NAME} (${baseUrl}/pricing).`,
    '',
    '## Citation Format',
    '',
    `${SITE_NAME} (${baseUrl}/)`,
    '',
    '## Crawler Access',
    '',
    `AI search and user-requested fetches (${AI_SEARCH_BOTS.join(', ')}) and training crawlers (${AI_TRAINING_BOTS.join(', ')}) `
      + `may read the public pages; ${BLOCKED_BOTS.join(', ')} may not. See ${baseUrl}/robots.txt.`,
    '',
    '## Scope Limitations',
    '',
    `Applies to the public pages (${publicPaths.join(', ')}, and the tender lists under /government-tenders/) and their markdown versions.`,
    `Not included: ${PRIVATE_PATHS.join(', ')} (signed-in, private or not content).`,
    '',
    '## Contact',
    '',
    `Email: ${CONTACT_EMAIL}`,
    '',
    '## Related Files',
    '',
    `- [llms.txt](${baseUrl}/llms.txt)`,
    `- [Full content (llms-full.txt)](${baseUrl}/llms-full.txt)`,
    `- [robots.txt](${baseUrl}/robots.txt)`,
    `- [Sitemap](${baseUrl}/sitemap.xml)`,
    '',
  ].join('\n');
}

export function robotsTxt(baseUrl) {
  const disallow = PRIVATE_PATHS.map((p) => `Disallow: ${p}`);
  const group = (bots) => [...bots.map((b) => `User-agent: ${b}`), 'Allow: /', ...disallow];
  return [
    `# ${SYNC_NOTE}`,
    `# About this site for AI agents: ${baseUrl}/llms.txt (usage policy: ${baseUrl}/ai.txt)`,
    '',
    ...group(['*']),
    '',
    '# AI search and user-requested fetches: allowed on public pages',
    ...group(AI_SEARCH_BOTS),
    '',
    '# AI training crawlers: allowed on public pages',
    ...group(AI_TRAINING_BOTS),
    '',
    '# Not allowed',
    ...BLOCKED_BOTS.map((b) => `User-agent: ${b}`),
    'Disallow: /',
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
