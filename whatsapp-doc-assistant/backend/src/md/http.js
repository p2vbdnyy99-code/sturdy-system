// HTTP details for the markdown versions: Accept negotiation and the
// response headers every markdown or AI-discovery file carries.

/** q-value for each media range in an Accept header (absent: none). */
export function parseAccept(header) {
  const ranges = [];
  for (const part of String(header || '').split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';').map((s) => s.trim());
    if (!type) continue;
    const q = params.find((p) => p.startsWith('q='));
    const value = q ? Number.parseFloat(q.slice(2)) : 1;
    ranges.push({ type, q: Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0 });
  }
  return ranges;
}

/**
 * Whether a request asks for markdown rather than HTML: only when
 * text/markdown is named with a higher q than HTML gets (from text/html,
 * text/* or *\/*). A missing Accept or plain *\/* always gets HTML.
 */
export function prefersMarkdown(header) {
  const ranges = parseAccept(header);
  const q = (types) => Math.max(0, ...ranges.filter((r) => types.includes(r.type)).map((r) => r.q));
  const md = q(['text/markdown', 'text/x-markdown']);
  return md > 0 && md > q(['text/html', 'text/*', '*/*']);
}

export const CACHE = {
  page: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
  list: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  full: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

export function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Accept');
}

/**
 * Send a markdown body with the headers for an alternate of an HTML page:
 * noindex (the HTML stays canonical), its canonical URL, a token estimate.
 */
export function sendMarkdown(res, body, { status = 200, canonical, lastUpdated, cache = CACHE.page, negotiated = false } = {}) {
  setCors(res);
  res.status(status);
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.set('X-Markdown-Tokens', String(Math.ceil(body.length / 4)));
  res.set('X-Robots-Tag', 'noindex, follow');
  res.set('Cache-Control', status === 200 ? cache : 'no-store');
  if (canonical) {
    res.set('Content-Location', canonical);
    res.set('Link', `<${canonical}>; rel="canonical"`);
  }
  if (lastUpdated) res.set('Last-Modified', new Date(`${lastUpdated}T00:00:00Z`).toUTCString());
  if (negotiated) res.vary('Accept');
  return res.send(body);
}

/** A plain-text discovery file (llms.txt, llms-full.txt, ai.txt). */
export function sendText(res, body, cache = CACHE.page) {
  setCors(res);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', cache);
  return res.send(body);
}
