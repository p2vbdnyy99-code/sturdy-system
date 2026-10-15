// Matches src/bidpilot/routes/publicTenders.js (no sign-in) and
// src/bidpilot/routes/feed.js (in the app, with Track): government tenders
// collected from CPPP's public lists of central, state and GeM tenders.
import { request } from './client';

export type FeedKind = 'central' | 'state' | 'gem';
export type FeedStatus = 'open' | 'closing' | 'closed' | 'all';
export type FeedSort = 'newest' | 'closing';

export type FeedQuery = {
  kind: FeedKind | 'all';
  status: FeedStatus;
  sort: FeedSort;
  search: string;
  state: string;
  organisation: string;
  page: number;
};

export type FeedTender = {
  id: string;
  kind: FeedKind;
  title: string;
  reference: string | null;
  tenderId: string | null;
  organisation: string | null;
  department: string | null;
  state: string | null;
  category: string | null;
  publishedAt: string | null;
  closingAt: string | null;
  openingAt: string | null;
  /** Where to find it: the portal's search page (GeM's bid list for GeM), and the ID to search for. */
  find: { url: string; label: string; searchFor: string | null };
  /** GeM bids: CPPP's page for the bid (details only; its PDF link doesn't work). */
  details: { url: string; label: string } | null;
};

export type FeedResult = { tenders: FeedTender[]; total: number; page: number; limit: number };

export type FeedFacets = {
  open: Record<FeedKind, number>;
  states: Array<{ name: string; count: number }>;
  organisations: { central: Array<{ name: string; count: number }>; gem: Array<{ name: string; count: number }> };
  lists: Partial<Record<FeedKind, { lastSuccessAt: string | null; lastSweepFinishedAt: string | null; totalPages: number | null; nextPage: number }>>;
};

function params(q: FeedQuery) {
  return {
    kind: q.kind,
    status: q.status,
    sort: q.sort,
    search: q.search || undefined,
    state: q.state || undefined,
    organisation: q.organisation || undefined,
    page: q.page > 1 ? q.page : undefined,
  };
}

export function getPublicTenders(q: FeedQuery) {
  return request<FeedResult>('/bidpilot/public/tenders', { query: params(q) });
}

export function getFeedFacets() {
  return request<FeedFacets>('/bidpilot/public/tenders/facets');
}

/** The in-app feed: the same search, signed in. */
export function getFeed(q: FeedQuery) {
  return request<FeedResult & { collecting: boolean }>('/bidpilot/feed', { query: params(q) });
}

export function trackFeedTender(feedId: string, companyId: string) {
  return request<{ tenderId: string; alreadyTracked: boolean }>(`/bidpilot/feed/${feedId}/track`, { method: 'POST', body: { companyId } });
}
