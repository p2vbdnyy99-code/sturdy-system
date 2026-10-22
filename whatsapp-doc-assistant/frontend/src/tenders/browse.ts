// Small helpers for the tender search: labels, and turning the URL's query
// string into filters and back (so views can be bookmarked and shared).
import type { FeedKind, FeedQuery, FeedSort, FeedStatus, FeedTender } from '../api/feed';

export const KIND_LABELS: Record<FeedKind | 'all', string> = {
  all: 'All',
  central: 'Central govt',
  state: 'States',
  gem: 'GeM',
};

export const STATUSES: Array<{ value: FeedStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'closing', label: 'Closing in 7 days' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export const SORTS: Array<{ value: FeedSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'closing', label: 'Closing soonest' },
];

const KINDS = ['all', 'central', 'state', 'gem'];

export function queryFromParams(p: URLSearchParams): FeedQuery {
  const pick = <T extends string>(v: string | null, allowed: readonly string[], fallback: T): T => (v && allowed.includes(v) ? (v as T) : fallback);
  const page = Number.parseInt(p.get('page') ?? '', 10);
  return {
    kind: pick(p.get('kind'), KINDS, 'all'),
    status: pick(p.get('status'), STATUSES.map((s) => s.value), 'open'),
    sort: pick(p.get('sort'), SORTS.map((s) => s.value), 'newest'),
    search: (p.get('q') ?? '').slice(0, 100),
    state: (p.get('state') ?? '').slice(0, 200),
    organisation: (p.get('org') ?? '').slice(0, 200),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** Only what differs from the defaults goes in the URL. */
export function paramsFromQuery(q: FeedQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.kind !== 'all') p.set('kind', q.kind);
  if (q.state) p.set('state', q.state);
  if (q.organisation) p.set('org', q.organisation);
  if (q.search) p.set('q', q.search);
  if (q.status !== 'open') p.set('status', q.status);
  if (q.sort !== 'newest') p.set('sort', q.sort);
  if (q.page > 1) p.set('page', String(q.page));
  return p;
}

/** The small label on each row: which list it came from. */
export function kindTag(t: Pick<FeedTender, 'kind' | 'state'>): string {
  if (t.kind === 'state') return t.state ?? 'State';
  if (t.kind === 'gem') return 'GeM';
  return 'Central govt';
}
