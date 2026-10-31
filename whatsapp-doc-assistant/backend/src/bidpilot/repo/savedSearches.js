// Saved searches and their in-app alerts (schema/alerts.js).
// -----------------------------------------------------------------------------
// A company saves a tender-feed search: the list (central, state, GeM), a
// state or organisation, and words. Every few minutes matchSavedSearches()
// finds open tenders the collector first saw after the search was saved,
// using the search's own conditions (publicTenders.js feedWhere), and records
// each as a match once. The app shows unseen matches as a count on the rail
// and in a "New for your searches" list; opening the list marks them seen.
// Matches are public notices; the saved search and its matches belong to the
// company and are only read through its scope.

import { and, asc, desc, eq, gt, gte, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { publicTenders, savedSearches, savedSearchMatches } from '../../db/schema/index.js';
import { log } from '../../logger.js';
import { feedWhere, toFeedRow, KINDS } from './publicTenders.js';

export const MAX_SAVED_SEARCHES = 10;
export const NAME_MAX = 80;
/** At most this many new matches per search per run, so one broad search can't flood the list. */
export const MATCHES_PER_RUN = 200;
/** How long seen matches stay in the list. */
export const KEEP_SEEN_DAYS = 14;

/**
 * Checks a saved search's filters: the same ones as the search, and at
 * least one of them (a search for "everything" would alert on every tender).
 * @returns {{ ok: true, filters: object } | { ok: false, error: string }}
 */
export function parseSavedFilters(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const str = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
  const kind = str(f.kind, 10) || 'all';
  if (kind !== 'all' && !KINDS.includes(kind)) return { ok: false, error: 'Unknown list.' };
  const filters = {
    kind,
    state: kind === 'state' ? str(f.state, 200) : '',
    organisation: kind === 'central' || kind === 'gem' ? str(f.organisation, 200) : '',
    search: str(f.search, 100),
  };
  if (filters.kind === 'all' && !filters.state && !filters.organisation && !filters.search) {
    return { ok: false, error: 'Choose a list, a state, an organisation or some words to search for first.' };
  }
  return { ok: true, filters };
}

const KIND_NAME = { central: 'Central govt', state: 'States', gem: 'GeM' };

/** "GeM · Ministry of Defence · "road"" */
export function defaultName(filters) {
  const parts = [];
  if (filters.state) parts.push(filters.state);
  else if (filters.kind !== 'all') parts.push(KIND_NAME[filters.kind]);
  if (filters.organisation) parts.push(filters.organisation);
  if (filters.search) parts.push(`“${filters.search}”`);
  return parts.join(' · ').slice(0, NAME_MAX);
}

export class SavedSearchLimitError extends Error {}

export async function listSavedSearches(scope) {
  const [rows, counts] = await Promise.all([
    scope.db.select().from(savedSearches)
      .where(eq(savedSearches.companyId, scope.companyId))
      .orderBy(asc(savedSearches.createdAt)),
    scope.db.select({ id: savedSearchMatches.savedSearchId, n: sql`count(*)::int` }).from(savedSearchMatches)
      .where(and(eq(savedSearchMatches.companyId, scope.companyId), isNull(savedSearchMatches.seenAt)))
      .groupBy(savedSearchMatches.savedSearchId),
  ]);
  const unseen = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({ id: r.id, name: r.name, filters: r.filters, createdAt: r.createdAt, unseen: unseen.get(r.id) ?? 0 }));
}

export async function createSavedSearch(scope, { name, filters }, userId) {
  const [{ n }] = await scope.db.select({ n: sql`count(*)::int` }).from(savedSearches).where(eq(savedSearches.companyId, scope.companyId));
  if (n >= MAX_SAVED_SEARCHES) throw new SavedSearchLimitError(`You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one first.`);
  const row = await scope.insertOwned(savedSearches, 'companyId', {
    name: (typeof name === 'string' && name.trim() ? name.trim().replace(/\s+/g, ' ') : defaultName(filters)).slice(0, NAME_MAX),
    filters,
    createdBy: userId,
  });
  return { id: row.id, name: row.name, filters: row.filters, createdAt: row.createdAt, unseen: 0 };
}

export async function deleteSavedSearch(scope, id) {
  const rows = await scope.db.delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.companyId, scope.companyId)))
    .returning({ id: savedSearches.id });
  return rows.length > 0;
}

/** Unseen matches across all of the company's saved searches. */
export async function unseenCount(scope) {
  const [{ n }] = await scope.db.select({ n: sql`count(*)::int` }).from(savedSearchMatches)
    .where(and(eq(savedSearchMatches.companyId, scope.companyId), isNull(savedSearchMatches.seenAt)));
  return n;
}

/** Recent matches (unseen first, then seen within KEEP_SEEN_DAYS), with the tender. */
export async function listMatches(scope, { savedSearchId = null, limit = 100, now = new Date() } = {}) {
  const keepFrom = new Date(now.getTime() - KEEP_SEEN_DAYS * 86_400_000);
  const conditions = [
    eq(savedSearchMatches.companyId, scope.companyId),
    sql`(${savedSearchMatches.seenAt} is null or ${savedSearchMatches.seenAt} >= ${keepFrom})`,
  ];
  if (savedSearchId) conditions.push(eq(savedSearchMatches.savedSearchId, savedSearchId));
  const rows = await scope.db.select({ m: savedSearchMatches, t: publicTenders, searchName: savedSearches.name })
    .from(savedSearchMatches)
    .innerJoin(publicTenders, eq(publicTenders.id, savedSearchMatches.publicTenderId))
    .innerJoin(savedSearches, and(eq(savedSearches.id, savedSearchMatches.savedSearchId), eq(savedSearches.companyId, scope.companyId)))
    .where(and(...conditions))
    .orderBy(sql`${savedSearchMatches.seenAt} is not null`, desc(savedSearchMatches.createdAt))
    .limit(Math.min(Math.max(1, limit), 200));
  return rows.map((r) => ({
    matchId: r.m.id,
    savedSearchId: r.m.savedSearchId,
    searchName: r.searchName,
    seen: r.m.seenAt !== null,
    matchedAt: r.m.createdAt,
    tender: toFeedRow(r.t),
  }));
}

/** Marks the given matches (or all of the company's) as seen. Returns how many changed. */
export async function markSeen(scope, matchIds = null) {
  const conditions = [eq(savedSearchMatches.companyId, scope.companyId), isNull(savedSearchMatches.seenAt)];
  if (Array.isArray(matchIds)) {
    if (matchIds.length === 0) return 0;
    conditions.push(inArray(savedSearchMatches.id, matchIds));
  }
  const rows = await scope.db.update(savedSearchMatches).set({ seenAt: new Date() }).where(and(...conditions))
    .returning({ id: savedSearchMatches.id });
  return rows.length;
}

/**
 * For every saved search (all companies): open tenders first seen after the
 * search was saved that match its filters and aren't matched yet. Not
 * scoped, because it runs for everyone; each match row carries its search's
 * company. Returns the number of new matches.
 */
export async function matchSavedSearches(db, now = new Date()) {
  const searches = await db.select().from(savedSearches);
  let added = 0;
  for (const s of searches) {
    const parsed = parseSavedFilters(s.filters);
    if (!parsed.ok) continue;
    const where = and(
      feedWhere({ ...parsed.filters, status: 'open' }, now),
      gt(publicTenders.firstSeenAt, s.createdAt),
      gte(publicTenders.closingAt, now),
      notExists(db.select({ one: sql`1` }).from(savedSearchMatches)
        .where(and(eq(savedSearchMatches.savedSearchId, s.id), eq(savedSearchMatches.publicTenderId, publicTenders.id)))),
    );
    const found = await db.select({ id: publicTenders.id }).from(publicTenders).where(where)
      .orderBy(asc(publicTenders.firstSeenAt)).limit(MATCHES_PER_RUN);
    if (found.length === 0) continue;
    const inserted = await db.insert(savedSearchMatches)
      .values(found.map((f) => ({ savedSearchId: s.id, companyId: s.companyId, publicTenderId: f.id })))
      .onConflictDoNothing()
      .returning({ id: savedSearchMatches.id });
    added += inserted.length;
  }
  return added;
}

/** Runs matchSavedSearches a minute after start and then every few minutes. */
export function startAlertMatcher(db, { everyMs = 10 * 60 * 1000 } = {}) {
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      const added = await matchSavedSearches(db);
      if (added) log.info(`metric bidpilot_alerts new_matches=${added}`);
    } catch (err) {
      log.warn(`bidpilot alerts: matching failed (${String(err?.message || err).slice(0, 120)})`);
    }
    if (!stopped) timer = setTimeout(tick, everyMs);
  };
  timer = setTimeout(tick, 60_000);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
