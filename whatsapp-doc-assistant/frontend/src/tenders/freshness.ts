// How fresh the tender lists are, as the server reports it with the facets
// (backend src/bidpilot/discovery/freshness.js; the thresholds live there).
// Only a successful read counts as an update; a failed attempt never does.
// Fresh lists get a quiet "Updated …" line; anything else gets a notice, so
// nobody takes a stale list for today's.

export type FeedStatus = 'fresh' | 'delayed' | 'stale' | 'unavailable';
export type SourceFreshness = { status: FeedStatus; lastSuccessAt: string | null };
export type FeedFreshness = { checkedAt: string; status: FeedStatus; sources: Record<string, SourceFreshness> };

const RANK: Record<FeedStatus, number> = { fresh: 0, delayed: 1, stale: 2, unavailable: 3 };
const LABEL: Record<string, string> = { central: 'Central government tenders', state: 'State tenders', gem: 'GeM bids' };

/** The status of one list, or the worst of all when no list is chosen. */
export function freshnessFor(f: FeedFreshness | null | undefined, kind: string | null): (SourceFreshness & { lists: string[] }) | null {
  if (!f || !f.sources) return null;
  if (kind && f.sources[kind]) return { ...f.sources[kind], lists: [kind] };
  const entries = Object.entries(f.sources);
  if (entries.length === 0) return null;
  const worst = entries.reduce((a, b) => (RANK[b[1].status] > RANK[a[1].status] ? b : a))[1].status;
  const same = entries.filter(([, s]) => s.status === worst);
  const oldest = same.map(([, s]) => s.lastSuccessAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  return { status: worst, lastSuccessAt: oldest, lists: same.map(([k]) => k) };
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(new Date(iso));

/** "23 October 2026", in India. */
export const longDate = (iso: string) => fmt(iso, { day: 'numeric', month: 'long', year: 'numeric' });
/** "5 Nov, 10:12 am", in India. */
export const shortDateTime = (iso: string) => fmt(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** What the page says about freshness, or null when nothing is known. */
export function freshnessView(f: FeedFreshness | null | undefined, kind: string | null):
  { tone: 'quiet' | 'info' | 'warning'; text: string } | null {
  const s = freshnessFor(f, kind);
  if (!s) return null;
  const when = s.lastSuccessAt;
  if (s.status === 'fresh' && when) return { tone: 'quiet', text: `Updated ${shortDateTime(when)} IST from CPPP.` };
  if (s.status === 'delayed' && when) {
    return { tone: 'info', text: `Last updated ${shortDateTime(when)} IST. The next update is late, so the newest tenders may be missing.` };
  }
  // One list on its own page: "This list"; the all-lists view names them.
  const subject = kind ? 'This list has' : `${joinLabels(s.lists)} have`; // every label is plural
  if (!when) return { tone: 'warning', text: `${subject} not been updated recently. Check the portal before you bid.` };
  return {
    tone: 'warning',
    text: `${subject} not been updated since ${longDate(when)}. Tenders published since then are missing, and the ones shown `
      + 'may have been extended, corrected or cancelled. Check the portal before you bid.',
  };
}

/** "N open tenders right now" only while fresh; otherwise as of the last update. */
export function countWording(f: FeedFreshness | null | undefined, kind: string | null): string {
  const s = freshnessFor(f, kind);
  if (!s || s.status === 'fresh') return 'open tenders right now';
  if (!s.lastSuccessAt) return 'open tenders in our last update';
  return `open tenders in our last update (${longDate(s.lastSuccessAt)})`;
}

function joinLabels(lists: string[]) {
  const names = lists.map((l) => LABEL[l] ?? l);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
