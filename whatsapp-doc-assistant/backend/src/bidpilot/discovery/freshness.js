// How fresh the tender lists are (Nov 2026). CPPP replaced its website on
// about 23 Oct 2026 and the collector has read nothing since, while the site
// kept saying "open tenders right now". These rules turn each list's last
// successful read (discovery_state) into a status that the public lists,
// the founder's dashboard and the nightly email all share.
//
// Thresholds follow the collector's schedule (collector.js): in normal
// operation it reads a page of some list every few seconds and every list
// at least every few minutes; failures back off up to 30 minutes.
//   fresh        last success within FRESH_HOURS
//   delayed      up to STALE_HOURS
//   stale        up to UNAVAILABLE_DAYS
//   unavailable  switched off, never read, or no success for longer
// marketing/automation/ttm/nightly.py uses the same numbers
// (test/bidpilot/freshness.test.js checks they match).
//
// Only the last *successful* read counts as an update. A failed attempt is
// reported separately (lastFailureAt, lastError) and never as an update.

export const FRESH_HOURS = 2;
export const STALE_HOURS = 24;
export const UNAVAILABLE_DAYS = 7;

export const FEED_SOURCES = {
  central: 'Central government tenders',
  state: 'State tenders',
  gem: 'GeM bids',
};

const RANK = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 };
export const statusRank = (s) => RANK[s] ?? RANK.unavailable;

const HOUR = 3600 * 1000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * One list's status.
 * @param {{ list: string, enabled: boolean, lastSuccessAt?: Date|string|null,
 *           lastError?: string|null, updatedAt?: Date|string|null }} s
 */
export function sourceFreshness({ list, enabled, lastSuccessAt = null, lastError = null, updatedAt = null }, now = new Date()) {
  const success = lastSuccessAt ? new Date(lastSuccessAt) : null;
  const valid = success && !Number.isNaN(success.getTime()) ? success : null;
  // An error is cleared by the next success, so while it is set, the row's
  // updated_at is when it was recorded.
  const lastFailureAt = lastError && updatedAt ? iso(updatedAt) : null;
  const ageHours = valid ? Math.max(0, (now.getTime() - valid.getTime()) / HOUR) : null;
  const [status, reason] = !enabled ? ['unavailable', 'off']
    : ageHours === null ? ['unavailable', 'never']
      : ageHours <= FRESH_HOURS ? ['fresh', null]
        : ageHours <= STALE_HOURS ? ['delayed', null]
          : ageHours <= UNAVAILABLE_DAYS * 24 ? ['stale', null]
            : ['unavailable', 'failing'];
  return {
    list,
    label: FEED_SOURCES[list] ?? list,
    status,
    reason,
    lastSuccessAt: iso(valid),
    lastFailureAt,
    lastError: lastError ? String(lastError).slice(0, 200) : null,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
  };
}

/**
 * Every list's status, plus the worst of the enabled ones (or of all, when
 * none is enabled).
 * @param {Array<{ list: string, lastSuccessAt?, lastError?, updatedAt? }>} rows discovery_state rows
 * @param {{ cppp: boolean, lists: string[] }} settings config.bidpilot.discovery
 */
export function feedFreshness(rows, settings, now = new Date()) {
  const byList = new Map((rows ?? []).map((r) => [r.list, r]));
  const sources = Object.keys(FEED_SOURCES).map((list) => sourceFreshness({
    list,
    enabled: Boolean(settings?.cppp) && (settings?.lists ?? []).includes(list),
    lastSuccessAt: byList.get(list)?.lastSuccessAt ?? null,
    lastError: byList.get(list)?.lastError ?? null,
    updatedAt: byList.get(list)?.updatedAt ?? null,
  }, now));
  const considered = sources.some((s) => s.reason !== 'off') ? sources.filter((s) => s.reason !== 'off') : sources;
  const worst = considered.reduce((a, b) => (statusRank(b.status) > statusRank(a.status) ? b : a));
  return { checkedAt: now.toISOString(), status: worst.status, sources };
}

/** What the public may see: no error text, no failure times. */
export function publicFreshness(f) {
  if (!f) return null;
  return {
    checkedAt: f.checkedAt,
    status: f.status,
    sources: Object.fromEntries(f.sources.map((s) => [s.list, { status: s.status, lastSuccessAt: s.lastSuccessAt }])),
  };
}

/** The status of the lists a page shows: one kind, or the worst of all. */
export function freshnessFor(pub, kind = null) {
  if (!pub) return null;
  if (kind && pub.sources[kind]) return pub.sources[kind];
  const all = Object.values(pub.sources);
  const worst = all.reduce((a, b) => (statusRank(b.status) > statusRank(a.status) ? b : a), all[0]);
  // The oldest successful read among the lists in that status.
  const oldest = all.filter((s) => s.status === worst.status && s.lastSuccessAt)
    .map((s) => s.lastSuccessAt).sort()[0] ?? null;
  return { status: worst.status, lastSuccessAt: oldest };
}

/** "23 October 2026", in India. */
export function istLongDate(isoString) {
  if (!isoString) return null;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(isoString));
}

/**
 * The sentence a public page shows about its list's freshness, or null
 * when the list is fresh (the page then says "right now" as before).
 */
export function staleNotice(f) {
  if (!f || f.status === 'fresh') return null;
  const when = istLongDate(f.lastSuccessAt);
  if (f.status === 'delayed') {
    return `This list was last updated on ${when}; the next update is late.`;
  }
  return when
    ? `This list has not been updated since ${when}. Tenders published since then are missing, and the ones shown may have `
      + 'been extended, corrected or cancelled. Check the portal before you bid.'
    : 'This list is not being updated at the moment. Check the portal before you bid.';
}

/**
 * What changed since the last check: lists that got worse (alert once) and
 * lists that recovered to fresh (note once). Unchanged lists say nothing,
 * so an unresolved failure is reported once, not on every check.
 * @param {Record<string,string>|null} previous list -> status at the last check (null: first check)
 * @param {{ sources: Array<{ list, status }> }} current feedFreshness() result
 */
export function feedChanges(previous, current) {
  const worse = [];
  const recovered = [];
  for (const s of current.sources) {
    const before = previous?.[s.list] ?? 'fresh';
    if (statusRank(s.status) > statusRank(before)) worse.push(s);
    else if (s.status === 'fresh' && before !== 'fresh') recovered.push(s);
  }
  return { worse, recovered, statuses: Object.fromEntries(current.sources.map((s) => [s.list, s.status])) };
}
