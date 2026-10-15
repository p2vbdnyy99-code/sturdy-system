import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getFeedFacets, type FeedFacets, type FeedQuery, type FeedResult, type FeedTender } from '../api/feed';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { dueLabel } from '../shell/queue';
import { formatDate } from '../format';
import { KIND_LABELS, kindTag, queryFromParams, paramsFromQuery, SORTS, STATUSES } from './browse';

// The government tender search, shared by the public page
// (/government-tenders) and the in-app Tender feed. Filters live in the URL
// so a view (say, open tenders in Maharashtra) can be bookmarked or shared.
// Portals ask for a captcha before they show a tender, so each row offers
// the tender id to copy and a link to the right portal's search; GeM bids
// open directly.
type Props = {
  load: (q: FeedQuery) => Promise<FeedResult>;
  /** In the app: add to my tenders. Signed out: undefined (the row offers sign-up instead). */
  onTrack?: (t: FeedTender) => Promise<void>;
};

export function TenderBrowser({ load, onTrack }: Props) {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(params), [params]);
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState<FeedResult | null>(null);
  // Which filters `data` belongs to: until the new list arrives, the old one
  // stays visible but is marked busy (and dimmed).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = paramsFromQuery(query).toString();
  const [facets, setFacets] = useState<FeedFacets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = useCallback((changes: Partial<FeedQuery>) => {
    // Any change other than the page goes back to page 1.
    const next = { ...query, ...changes, page: changes.page ?? 1 };
    setParams(paramsFromQuery(next), { replace: false });
  }, [query, setParams]);

  useEffect(() => {
    if (searchInput === query.search) return undefined;
    const t = setTimeout(() => update({ search: searchInput.trim() }), 350);
    return () => clearTimeout(t);
  }, [searchInput, query.search, update]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load(query)
      .then((r) => { if (!cancelled) { setData(r); setLoadedKey(key); } })
      .catch((err) => { if (!cancelled) { setError(err instanceof ApiError ? err.message : 'Could not load tenders.'); setLoadedKey(key); } });
    return () => { cancelled = true; };
  }, [load, query, key]);

  useEffect(() => {
    getFeedFacets().then(setFacets).catch(() => setFacets(null));
  }, []);

  async function track(t: FeedTender) {
    if (!onTrack) return;
    setBusy(t.id);
    setError(null);
    try { await onTrack(t); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not track this tender.');
      setBusy(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const orgOptions = query.kind === 'central' || query.kind === 'gem' ? facets?.organisations[query.kind] ?? [] : [];
  const showStateGrid = query.kind === 'state' && !query.state && !query.search && (facets?.states.length ?? 0) > 0;
  const showOrgGrid = (query.kind === 'central' || query.kind === 'gem') && !query.organisation && !query.search && orgOptions.length > 0;

  return (
    <div className="tb" aria-busy={loadedKey !== key}>
      <div className="tb-kinds segmented" role="group" aria-label="Which tenders">
        {(['all', 'central', 'state', 'gem'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={query.kind === k}
            onClick={() => update({ kind: k, state: '', organisation: '' })}>
            {KIND_LABELS[k]}
            {facets && k !== 'all' && <span className="tb-kind-count">{facets.open[k].toLocaleString('en-IN')}</span>}
          </button>
        ))}
      </div>

      <div className="tb-filters">
        <label className="queue-search tb-search">
          <Icon name="search" />
          <span className="visually-hidden">Search tenders</span>
          <input type="search" placeholder="Search work, department, place or tender ID" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        {query.kind === 'state' && (
          <label className="tb-select tb-select-wide">
            <span>State</span>
            <select value={query.state} onChange={(e) => update({ state: e.target.value })}>
              <option value="">All states</option>
              {facets?.states.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
              {query.state && !facets?.states.some((s) => s.name === query.state) && <option value={query.state}>{query.state}</option>}
            </select>
          </label>
        )}
        {(query.kind === 'central' || query.kind === 'gem') && (
          <label className="tb-select tb-select-wide">
            <span>Organisation</span>
            <select value={query.organisation} onChange={(e) => update({ organisation: e.target.value })}>
              <option value="">All organisations</option>
              {orgOptions.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.count})</option>)}
              {query.organisation && !orgOptions.some((o) => o.name === query.organisation) && <option value={query.organisation}>{query.organisation}</option>}
            </select>
          </label>
        )}
        <label className="tb-select">
          <span>Status</span>
          <select value={query.status} onChange={(e) => update({ status: e.target.value as FeedQuery['status'] })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="tb-select">
          <span>Sort</span>
          <select value={query.sort} onChange={(e) => update({ sort: e.target.value as FeedQuery['sort'] })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {showStateGrid && facets && (
        <div className="tb-grid" aria-label="Open tenders by state">
          {facets.states.map((s) => (
            <button key={s.name} type="button" className="tb-grid-item" onClick={() => update({ state: s.name })}>
              <span>{s.name}</span><strong>{s.count.toLocaleString('en-IN')}</strong>
            </button>
          ))}
        </div>
      )}
      {showOrgGrid && (
        <div className="tb-grid" aria-label="Organisations with the most open tenders">
          {orgOptions.slice(0, 12).map((o) => (
            <button key={o.name} type="button" className="tb-grid-item" onClick={() => update({ organisation: o.name })}>
              <span>{o.name}</span><strong>{o.count.toLocaleString('en-IN')}</strong>
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="error-text">{error}</p>}
      {!data && !error && <p className="muted">Loading tenders…</p>}
      {data && (
        <p className="tb-total muted" aria-live="polite">
          {data.total.toLocaleString('en-IN')} {data.total === 1 ? 'tender' : 'tenders'}
          {query.state && <> in {query.state}</>}
          {query.organisation && <> from {query.organisation}</>}
        </p>
      )}
      {data && data.tenders.length === 0 && (
        <EmptyState title="No tenders match" message={query.search ? 'Try fewer or different words.' : 'Try another status or list.'} />
      )}
      {data && data.tenders.length > 0 && (
        <ul className="tb-list">
          {data.tenders.map((t) => (
            <TenderRow key={t.id} t={t} busy={busy === t.id} onTrack={onTrack ? () => track(t) : undefined} />
          ))}
        </ul>
      )}
      {data && pages > 1 && (
        <div className="pagination">
          <button type="button" disabled={query.page <= 1} onClick={() => update({ page: query.page - 1 })}>Previous</button>
          <span className="muted">Page {query.page} of {Math.min(pages, 1000).toLocaleString('en-IN')}</span>
          <button type="button" disabled={query.page >= Math.min(pages, 1000)} onClick={() => update({ page: query.page + 1 })}>Next</button>
        </div>
      )}
    </div>
  );
}

function TenderRow({ t, busy, onTrack }: { t: FeedTender; busy: boolean; onTrack?: () => void }) {
  const due = dueLabel(t.closingAt);
  const [copied, setCopied] = useState<'button' | 'portal' | null>(null);
  const who = [t.organisation, t.department && t.department !== t.organisation ? t.department : null].filter(Boolean).join(' · ');

  async function copy(how: 'button' | 'portal') {
    const id = how === 'portal' ? t.find.searchFor : t.tenderId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(how);
      setTimeout(() => setCopied(null), how === 'portal' ? 8000 : 2000);
    } catch { /* the id stays visible to copy by hand */ }
  }

  return (
    <li className="tb-item">
      <div className="tb-main">
        <span className={`tb-tag tb-tag-${t.kind}`}>{kindTag(t)}</span>
        <span className="tb-title">{t.title}</span>
        {who && <span className="tb-who">{who}</span>}
        <span className="tb-dates">
          {t.closingAt && <>Closes <strong>{formatDate(t.closingAt)}</strong></>}
          {t.publishedAt && <> · Published {formatDate(t.publishedAt)}</>}
          {t.reference && <> · {t.reference}</>}
        </span>
        {t.tenderId && (
          <span className="tb-id">
            <span className="tb-id-label">{t.kind === 'gem' ? 'Bid number' : 'Tender ID'}</span>
            <code>{t.tenderId}</code>
            <button type="button" className="link-button tb-copy" onClick={() => copy('button')} aria-label={`Copy ${t.tenderId}`}>
              {copied === 'button' ? 'Copied' : 'Copy'}
            </button>
          </span>
        )}
      </div>
      <div className="tb-side">
        <span className={`queue-chip queue-chip-${due.tone}`} title={due.title}>{due.text}</span>
        {/* Portals need a search before they show a tender, so the button
            copies the ID it needs as it opens the portal in a new tab. */}
        <a className="btn-link btn-secondary tb-find" href={t.find.url} target="_blank" rel="noopener noreferrer"
          onClick={() => { void copy('portal'); }}
          title={t.find.searchFor ? `Copies ${t.find.searchFor} and opens the portal's search` : 'Opens the portal'}>
          {t.find.label} <span aria-hidden="true">↗</span>
        </a>
        {t.details && (
          <a className="btn-link btn-secondary tb-find tb-details" href={t.details.url} target="_blank" rel="noopener noreferrer"
            title="Bid number, dates, quantity, item and buyer on CPPP. Download the bid document from GeM.">
            {t.details.label} <span aria-hidden="true">↗</span>
          </a>
        )}
        {onTrack
          ? <button type="button" className="btn-primary" disabled={busy} onClick={onTrack}>{busy ? 'Adding…' : 'Track'}</button>
          : <Link to="/register" className="btn-link btn-primary">Track free</Link>}
        {copied === 'portal' && (
          <span className="tb-copied" role="status">
            {t.kind === 'gem' ? 'Bid number' : 'Tender ID'} copied: paste it into the portal&rsquo;s search box.
          </span>
        )}
      </div>
    </li>
  );
}

