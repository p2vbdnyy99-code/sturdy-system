// Reading the tender feed (public_tenders): search with filters, counts for
// the filter menus, and how fresh each list is. Used by the public tender
// search (routes/publicTenders.js, no sign-in) and the in-app feed
// (routes/feed.js). Public notices only; nothing here is company data.

import { and, asc, desc, eq, gte, ilike, isNotNull, lt, or, sql } from 'drizzle-orm';
import { publicTenders, discoveryState } from '../../db/schema/index.js';
import { findOnPortal } from '../discovery/portals.js';

export const KINDS = ['central', 'state', 'gem'];
export const STATUSES = ['open', 'closing', 'closed', 'all'];
export const SORTS = ['newest', 'closing'];
export const CLOSING_SOON_DAYS = 7;
const MAX_FILTER = 200;

/**
 * Checks and tidies query parameters.
 * @returns {{ ok: true, filters: object } | { ok: false, error: string }}
 */
export function parseFeedQuery(q) {
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const kind = str(q.kind, 10) || 'all';
  if (kind !== 'all' && !KINDS.includes(kind)) return { ok: false, error: 'kind must be central, state, gem or all.' };
  // "when" is the first feed's name for status; both are accepted.
  const status = str(q.status ?? q.when, 10) || 'open';
  if (!STATUSES.includes(status)) return { ok: false, error: 'status must be open, closing, closed or all.' };
  const sort = str(q.sort, 10) || 'newest';
  if (!SORTS.includes(sort)) return { ok: false, error: 'sort must be newest or closing.' };
  const page = Number.parseInt(q.page, 10) || 1;
  const limit = Number.parseInt(q.limit, 10) || 25;
  if (page < 1 || page > 1000) return { ok: false, error: 'page must be between 1 and 1000.' };
  return {
    ok: true,
    filters: {
      kind, status, sort, page,
      limit: Math.min(Math.max(1, limit), 50),
      search: str(q.search, 100),
      state: str(q.state, MAX_FILTER),
      organisation: str(q.organisation, MAX_FILTER),
    },
  };
}

/** The search's conditions; also used to match saved searches (savedSearches.js). */
export function feedWhere({ kind, status, search, state, organisation }, now) {
  const c = [];
  if (kind !== 'all') c.push(eq(publicTenders.kind, kind));
  if (state) c.push(eq(publicTenders.state, state));
  if (organisation) c.push(eq(publicTenders.organisation, organisation));
  if (search) {
    const p = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    c.push(or(
      ilike(publicTenders.title, p), ilike(publicTenders.organisation, p), ilike(publicTenders.tenderId, p),
      ilike(publicTenders.reference, p), ilike(publicTenders.department, p), ilike(publicTenders.state, p),
    ));
  }
  const soon = new Date(now.getTime() + CLOSING_SOON_DAYS * 86400000);
  if (status === 'open') c.push(gte(publicTenders.closingAt, now));
  if (status === 'closing') c.push(and(gte(publicTenders.closingAt, now), lt(publicTenders.closingAt, soon)));
  if (status === 'closed') c.push(lt(publicTenders.closingAt, now));
  return c.length ? and(...c) : undefined;
}

/** What the API returns for one tender (with where to find it). */
export function toFeedRow(r) {
  const find = findOnPortal(r);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    reference: r.reference,
    tenderId: r.tenderId,
    organisation: r.organisation,
    department: r.department,
    state: r.state,
    category: r.category,
    publishedAt: r.publishedAt,
    closingAt: r.closingAt,
    openingAt: r.openingAt,
    find,
  };
}

export async function searchFeed(db, filters, now = new Date()) {
  const where = feedWhere(filters, now);
  const order = filters.status === 'closed'
    ? [desc(publicTenders.closingAt)]
    : filters.sort === 'closing'
      ? [asc(publicTenders.closingAt), desc(publicTenders.publishedAt)]
      : [desc(publicTenders.publishedAt), asc(publicTenders.closingAt)];
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(publicTenders).where(where).orderBy(...order, asc(publicTenders.id))
      .limit(filters.limit).offset((filters.page - 1) * filters.limit),
    db.select({ count: sql`count(*)::int` }).from(publicTenders).where(where),
  ]);
  return { tenders: rows.map(toFeedRow), total: count, page: filters.page, limit: filters.limit };
}

/** Open tenders per list, per state and per organisation, for the filter menus. */
export async function feedFacets(db, now = new Date()) {
  const open = gte(publicTenders.closingAt, now);
  const [kinds, states, orgs, lists] = await Promise.all([
    db.select({ kind: publicTenders.kind, n: sql`count(*)::int` }).from(publicTenders).where(open).groupBy(publicTenders.kind),
    db.select({ name: publicTenders.state, n: sql`count(*)::int` }).from(publicTenders)
      .where(and(open, eq(publicTenders.kind, 'state'), isNotNull(publicTenders.state)))
      .groupBy(publicTenders.state).orderBy(asc(publicTenders.state)),
    db.select({ kind: publicTenders.kind, name: publicTenders.organisation, n: sql`count(*)::int` }).from(publicTenders)
      .where(and(open, isNotNull(publicTenders.organisation)))
      .groupBy(publicTenders.kind, publicTenders.organisation)
      .orderBy(desc(sql`count(*)`)),
    db.select().from(discoveryState),
  ]);
  const top = (kind) => orgs.filter((o) => o.kind === kind).slice(0, 80).map((o) => ({ name: o.name, count: o.n }));
  const count = (kind) => kinds.find((k) => k.kind === kind)?.n ?? 0;
  return {
    open: { central: count('central'), state: count('state'), gem: count('gem') },
    states: states.map((s) => ({ name: s.name, count: s.n })),
    organisations: { central: top('central'), gem: top('gem') },
    lists: Object.fromEntries(lists.map((l) => [l.list, {
      lastSuccessAt: l.lastSuccessAt, lastSweepFinishedAt: l.lastSweepFinishedAt,
      totalPages: l.totalPages, nextPage: l.nextPage,
    }])),
  };
}

/** A small in-memory cache for the facet counts (they change slowly). */
export function cachedFacets(ttlMs = 5 * 60 * 1000) {
  let value = null;
  let at = 0;
  let pending = null;
  return async (db) => {
    if (value && Date.now() - at < ttlMs) return value;
    if (!pending) {
      pending = feedFacets(db).then((v) => { value = v; at = Date.now(); return v; }).finally(() => { pending = null; });
    }
    return pending;
  };
}
