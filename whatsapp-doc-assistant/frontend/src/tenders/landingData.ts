// A tender list page's data, put in the page by the server (backend
// landingPages.js landingAppData): the landing page, the facets and the
// list's first page, as the API would answer. The app's first render uses
// them, so the page opens with its list instead of a loading message that
// the list later pushes down. A JSON block is data, not a script, so the
// strict CSP allows it.
//
// The data is as old as the page load, so it is used for that first page
// only. The block is read once and taken out of the page, and as soon as the
// tender search has shown a page, the data is spent: going elsewhere in the
// app and back to the same list fetches it fresh.
import type { FeedFacets, FeedQuery, FeedResult } from '../api/feed';
import { queryFromParams } from './browse.ts';
import type { LandingPage } from './landing';

export const LANDING_DATA_ID = 'landing-data';

export type LandingData = { page: LandingPage; facets: FeedFacets; result: FeedResult };

/** The query the app opens a landing page with (backend landingAppQuery). */
export function landingQuery(page: LandingPage): FeedQuery {
  return { ...queryFromParams(new URLSearchParams()), kind: page.kind, state: page.state, organisation: page.organisation };
}

type DocLike = { getElementById(id: string): { textContent: string | null; remove(): void } | null };

/** A reader of the page's data block (one per page load; tests make their own). */
export function createLandingDataReader(getDoc: () => DocLike | undefined) {
  let read = false;
  let data: LandingData | null = null;
  let spent = false;

  function readOnce(): LandingData | null {
    if (read) return data;
    read = true;
    const el = getDoc()?.getElementById(LANDING_DATA_ID);
    if (!el) return null;
    try {
      const parsed = JSON.parse(el.textContent || '') as LandingData;
      data = parsed?.page && parsed.result && parsed.facets ? parsed : null;
    } catch {
      data = null;
    }
    el.remove();
    return data;
  }

  return {
    /** The server's data for `pathname`, or null: no block, another page,
     *  or the search has already shown a page since the app started. */
    embedded(pathname: string): LandingData | null {
      if (spent) return null;
      const found = readOnce();
      return found && found.page.path === pathname ? found : null;
    },
    /** The search has shown a page: from now on every list is fetched. */
    markUsed() {
      spent = true;
    },
  };
}

const reader = createLandingDataReader(() => (typeof document === 'undefined' ? undefined : document));

/** The data the server put in this page for `pathname`, or null. */
export function embeddedLanding(pathname: string): LandingData | null {
  return reader.embedded(pathname);
}

/** Called by the tender search once it has shown a page (see above). */
export function landingDataUsed() {
  reader.markUsed();
}
