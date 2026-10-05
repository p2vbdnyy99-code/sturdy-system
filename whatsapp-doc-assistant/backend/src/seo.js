// What search engines and link previews see for the TenderTez website.
// -----------------------------------------------------------------------------
// The frontend is a single-page app: every URL gets the same index.html, whose
// only head content is "<title>TenderTez</title>". Google can run the app, but
// WhatsApp, LinkedIn and other link previews only read the HTML, so the public
// pages get their own title, description, canonical URL and Open Graph tags
// here, written into index.html as it is served. Signed-in app pages and
// anything unknown are marked noindex so they never appear in search.
// The descriptions only state what the public pages themselves say.

const SITE_NAME = 'TenderTez';

export const PUBLIC_PAGES = {
  '/': {
    title: 'TenderTez: read a government tender in minutes',
    description: 'Upload a tender PDF from CPPP, GeM or a state portal. TenderTez finds the deadline, EMD, '
      + 'eligibility conditions, BOQ and risky clauses, each with its page number. Your first 5 tenders are free.',
  },
  '/pricing': {
    title: 'Pricing | TenderTez',
    description: 'Your first 5 tenders are free, with no card needed. Planned plans start at ₹499 a month for '
      + '5 tenders.',
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

/** index.html with this path's head tags in place of the plain <title>. */
export function renderIndexHtml(indexHtml, path, baseUrl) {
  const page = PUBLIC_PAGES[normalizePath(path)];
  if (!page) {
    return indexHtml.replace('</title>', '</title>\n    <meta name="robots" content="noindex" />');
  }
  const url = `${baseUrl}${normalizePath(path) === '/' ? '/' : normalizePath(path)}`;
  const tags = [
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
  ].join('\n    ');
  return indexHtml.replace(/<title>[^<]*<\/title>/, tags);
}

export function robotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Disallow: /bidpilot/',
    'Disallow: /dashboard',
    'Disallow: /tenders/',
    'Disallow: /settings',
    'Disallow: /onboarding/',
    'Disallow: /verify-email',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(baseUrl) {
  const urls = Object.keys(PUBLIC_PAGES)
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
