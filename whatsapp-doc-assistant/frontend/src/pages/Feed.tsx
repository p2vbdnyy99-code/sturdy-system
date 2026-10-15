import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getFeed, trackFeedTender, type FeedResult, type FeedWhen } from '../api/feed';
import { useSession } from '../auth/SessionProvider';
import { Breadcrumb, Panel } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useShellData } from '../shell/ShellData';
import { dueLabel } from '../shell/queue';
import { formatDate } from '../format';

// The tender feed: tenders seen on the public CPPP "latest active tenders"
// page. That page shows only the newest tenders, so this is a growing record
// from the day collection started, not every tender in India — the page says
// so. Track adds one to your tenders; you attach its PDF from the portal.
const WHEN: Array<{ value: FeedWhen; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'closing', label: 'Closing in 7 days' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function FeedPage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string;
  const navigate = useNavigate();
  const shell = useShellData();
  const [when, setWhen] = useState<FeedWhen>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await getFeed({ when, search, page })); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the tender feed.');
    }
  }, [when, search, page]);

  useEffect(() => { load(); }, [load]);

  async function onTrack(id: string) {
    setTracking(id);
    setError(null);
    try {
      const r = await trackFeedTender(id, companyId);
      shell.reload();
      navigate(`/tenders/${r.tenderId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not track this tender.');
      setTracking(null);
    }
  }

  const cov = data?.coverage;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tender feed' }]} />
          <h1 className="page-title">Tender feed</h1>
          <p className="page-meta">
            <span>From the Central Public Procurement Portal (CPPP)</span>
            {cov?.lastUpdate && <span>Updated {formatDate(cov.lastUpdate)}</span>}
          </p>
        </div>
      </header>

      <div className="notice notice-info feed-coverage">
        <Icon name="info" />
        <span className="notice-text">
          {cov && cov.stored > 0
            ? <>Collected from CPPP&rsquo;s public &ldquo;latest tenders&rdquo; page since {formatDate(cov.since)}. That page shows only the newest tenders, so this is <strong>not every tender</strong>: GeM and state portals aren&rsquo;t included yet. Always confirm on the portal.</>
            : cov && !cov.collecting
              ? <>The feed isn&rsquo;t switched on yet. Once it is, tenders newly published on CPPP will appear here.</>
              : <>Collecting has started; tenders will appear here as CPPP publishes them.</>}
        </span>
      </div>

      <Panel id="feed" title="Tenders" aside={data ? <span className="panel-count">{data.total}</span> : undefined}>
        <div className="card">
          <div className="feed-controls">
            <div className="segmented feed-when" role="group" aria-label="Which tenders">
              {WHEN.map((w) => (
                <button key={w.value} type="button" aria-pressed={when === w.value} onClick={() => { setWhen(w.value); setPage(1); }}>{w.label}</button>
              ))}
            </div>
            <label className="queue-search feed-search">
              <Icon name="search" />
              <span className="visually-hidden">Search the feed</span>
              <input type="search" placeholder="Search title, department or reference" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </label>
          </div>
          {error && <p role="alert" className="error-text">{error}</p>}
          {!data && !error && <p className="muted">Loading…</p>}
          {data && data.tenders.length === 0 && <EmptyState title="No tenders here" message={search ? 'Try a different search.' : 'Nothing in this view yet.'} />}
          {data && data.tenders.length > 0 && (
            <ul className="feed-list">
              {data.tenders.map((t) => {
                const due = dueLabel(t.closingAt);
                return (
                  <li key={t.id} className="feed-item">
                    <div className="feed-main">
                      <span className="feed-title">{t.title}</span>
                      <span className="feed-sub">{[t.organisation, t.reference].filter(Boolean).join(' · ')}</span>
                      <span className="feed-dates">
                        {t.closingAt && <>Closes {formatDate(t.closingAt)}</>}
                        {t.publishedAt && <> · Published {formatDate(t.publishedAt)}</>}
                      </span>
                    </div>
                    <div className="feed-side">
                      <span className={`queue-chip queue-chip-${due.tone}`} title={due.title}>{due.text}</span>
                      <button type="button" className="btn-primary" disabled={tracking === t.id} onClick={() => onTrack(t.id)}>
                        {tracking === t.id ? 'Adding…' : 'Track'}
                      </button>
                      {t.url && <a className="link-button" href={t.url} target="_blank" rel="noopener noreferrer">View on CPPP ↗</a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {data && pages > 1 && (
            <div className="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="muted">Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
