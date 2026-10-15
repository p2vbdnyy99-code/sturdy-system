// Matches src/bidpilot/routes/feed.js: public tenders collected from the
// CPPP latest-tenders page, and Track to add one to the company's tenders.
import { request } from './client';

export type FeedWhen = 'open' | 'closing' | 'closed' | 'all';

export type FeedTender = {
  id: string;
  source: string;
  title: string;
  reference: string | null;
  organisation: string | null;
  publishedAt: string | null;
  closingAt: string | null;
  openingAt: string | null;
  url: string | null;
};

export type FeedResult = {
  tenders: FeedTender[];
  total: number;
  page: number;
  limit: number;
  coverage: { collecting: boolean; since: string | null; lastUpdate: string | null; stored: number };
};

export function getFeed(query: { when: FeedWhen; search?: string; page?: number }) {
  return request<FeedResult>('/bidpilot/feed', { query: { when: query.when, search: query.search || undefined, page: query.page } });
}

export function trackFeedTender(feedId: string, companyId: string) {
  return request<{ tenderId: string; alreadyTracked: boolean }>(`/bidpilot/feed/${feedId}/track`, { method: 'POST', body: { companyId } });
}
