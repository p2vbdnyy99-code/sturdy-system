// Server rendering of the public pages, so their text is in the HTML for
// crawlers that don't run JavaScript (several AI crawlers) and for slow
// phones before the app loads. Built separately (`vite build --ssr`, see
// package.json) into dist-ssr/prerender.js, which the server imports and
// renders from (backend/src/prerender.js). The browser app then replaces
// this HTML when it starts, exactly as it does for the landing pages.
//
// Rendered as a visitor who is not signed in: the session is still
// "loading", so no page redirects and nothing user-specific appears. Data
// fetched in effects (live tender counts) isn't fetched here; those parts
// show their empty state.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { SessionProvider } from './auth/SessionProvider';
import { AppRoutes } from './routes';
import { GUIDES, guidePath } from './guides/guides';

/** The public pages whose HTML is rendered on the server. /sample-analysis
 *  and the tender landing pages have their own server HTML. */
export const PRERENDER_PATHS = [
  '/', '/government-tenders', '/features', '/pricing', '/faq', '/about', '/privacy-policy', '/tender-consultants',
  '/guides', ...GUIDES.map((g) => guidePath(g.slug)),
];

export function render(path: string): string {
  return renderToString(
    <StaticRouter location={path}>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </StaticRouter>,
  );
}
