// Server HTML for the public React pages (home, features, pricing, FAQ,
// about, privacy, tender search, guides), so their text is in the page for
// crawlers that don't run JavaScript and for slow phones.
// -----------------------------------------------------------------------------
// The frontend build bundles the real pages into frontend/dist-ssr/prerender.js
// (frontend/src/prerender.tsx). This module imports that bundle once and
// renders a page on request, cached for a few hours: the home page's example
// deadline is "two weeks from now", so a render must not live for weeks. If
// the bundle is missing or a render fails, the page is served as before, with
// an empty #root that the app fills.

import { pathToFileURL } from 'node:url';

export function createPrerender(bundlePath, { log = console, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  let mod = null;
  const cache = new Map();
  const ready = import(pathToFileURL(bundlePath).href)
    .then((m) => { mod = m; })
    .catch((err) => log.warn(`prerender: public pages served without server HTML (${err.message})`));
  return {
    ready,
    paths: () => mod?.PRERENDER_PATHS ?? [],
    /** The page's body HTML, or null when it has none. */
    html(path) {
      if (!mod || !mod.PRERENDER_PATHS.includes(path)) return null;
      const hit = cache.get(path);
      if (hit && Date.now() - hit.at < ttlMs) return hit.html;
      try {
        const html = mod.render(path);
        cache.set(path, { html, at: Date.now() });
        return html;
      } catch (err) {
        log.error(`prerender: ${path} failed:`, err);
        return null;
      }
    },
  };
}
