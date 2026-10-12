import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb, Panel } from '../components/AppShell';
import { useShellData } from '../shell/ShellData';
import { EmptyState } from '../components/EmptyState';
import { AttentionBadge } from '../components/AttentionBadge';
import { Icon, type IconName } from '../components/Icon';
import { deriveAttentionState } from '../dashboard/attentionState';
import { daysUntil, displayTitle, formatDate, humanizeEnum } from '../format';
import { TenderRow } from '../dashboard/TenderRow';
import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import { CONTACT_EMAIL } from '../config/site';
import { allowanceNotice, type Allowance } from '../allowance';
import {
  listTenders, uploadTender, TENDER_STATUSES, ANALYSIS_STATUSES,
  type TenderListItem, type TenderStatus, type AnalysisStatus,
} from '../api/tenders';

const PAGE_SIZE = 20;

export function DashboardPage() {
  const { me, selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string; // CompanyGate guarantees this
  const companyName = me?.companies.find((c) => c.companyId === companyId)?.name;

  // Counts, the plan allowance and the deadline-ordered list come from the
  // shell (shared with the queue panel); the table below has its own,
  // filtered and paginated, fetch.
  const shell = useShellData();
  const summary = shell.summary;
  const summaryLoading = shell.loading;
  const summaryError = shell.error;

  // Filters — changing any of these resets to page 1.
  const [status, setStatus] = useState<TenderStatus | ''>('');
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'deadline' | 'createdAt'>('deadline');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  // Debounce the search box rather than firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [tenders, setTenders] = useState<TenderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSummary = shell.reload;

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await listTenders({
        companyId, page, limit: PAGE_SIZE,
        status: status || undefined,
        analysisStatus: analysisStatus || undefined,
        search: search || undefined,
        sortBy, sortOrder,
      });
      setTenders(result.tenders);
      setTotal(result.total);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not load tenders.');
    } finally {
      setListLoading(false);
    }
  }, [companyId, page, status, analysisStatus, search, sortBy, sortOrder]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function handleRowUpdate(tenderId: string, patch: Partial<TenderListItem>) {
    setTenders((prev) => prev.map((t) => (t.id === tenderId ? { ...t, ...patch } : t)));
    // A row settling (processing/analysis finishing) changes the summary
    // counts too — refresh the tiles rather than letting them go stale.
    fetchSummary();
  }

  function onUploadClick() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file again later
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      await uploadTender(file, companyId);
      await Promise.all([fetchList(), fetchSummary()]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function onSort(column: 'deadline' | 'createdAt') {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  }

  function clearFilters() {
    setStatus('');
    setAnalysisStatus('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  const hasActiveFilters = Boolean(status || analysisStatus || search);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts = summary
    ? { total: summary.totalTenders, processing: summary.processing, awaiting: summary.awaitingAnalysis, analysed: summary.analysed }
    : null;
  const upcoming = summary?.upcomingDeadlines;
  const next = shell.tenders.find((t) => { const d = daysUntil(t.submissionDeadline); return d !== null && d >= 0; }) ?? null;

  return (
    <div>
      <header className="page-head">
        <div className="page-head-text">
          <Breadcrumb items={[{ label: 'Dashboard' }]} />
          <h1 className="page-title">{companyName ?? 'Dashboard'}</h1>
          <p className="page-meta">
            {counts ? (
              <>
                <span>{counts.total} {counts.total === 1 ? 'tender' : 'tenders'}</span>
                <span>{counts.analysed} analysed</span>
                <span>{counts.awaiting} awaiting analysis</span>
              </>
            ) : <span>Your tenders</span>}
          </p>
          {upcoming && (
            <ul className="chips" aria-label="At a glance">
              {upcoming.count > 0 && (
                <li><span className="chip chip-danger"><Icon name="calendar" />{upcoming.count} {upcoming.count === 1 ? 'deadline' : 'deadlines'} in the next {upcoming.withinDays} days</span></li>
              )}
              {(counts?.processing ?? 0) > 0 && <li><span className="chip"><Icon name="clock" />{counts?.processing} processing</span></li>}
              {(counts?.awaiting ?? 0) > 0 && <li><span className="chip">{counts?.awaiting} to analyse</span></li>}
            </ul>
          )}
        </div>
        <div className="page-head-action">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={onFileSelected}
            className="visually-hidden"
          />
          <button type="button" className="btn-primary btn-large" onClick={onUploadClick} disabled={uploading}>
            <Icon name="upload" />
            {uploading ? 'Uploading…' : 'Upload tender'}
          </button>
        </div>
      </header>
      {uploadError && <p role="alert" className="error-text">{uploadError}</p>}

      {summaryError && <p role="alert" className="error-text">{summaryError}</p>}
      {summary?.allowance && allowanceNotice(summary.allowance).tone === 'warning' && <AllowanceBanner allowance={summary.allowance} />}

      <div className="grid-main-side">
        <Panel id="glance" title="Your tenders at a glance" aside={<span className="muted">{summaryLoading ? 'Loading…' : 'Live from your account'}</span>}>
          <div className="card">
            <dl className="fact-rows">
              <GlanceRow icon="layers" label="Total tenders" value={counts?.total} />
              <GlanceRow icon="clock" label="Processing" value={counts?.processing} total={counts?.total} />
              <GlanceRow icon="search" label="Awaiting analysis" value={counts?.awaiting} total={counts?.total} />
              <GlanceRow icon="check" label="Analysed" value={counts?.analysed} total={counts?.total} />
              <GlanceRow
                icon="calendar"
                label={`Deadlines in the next ${upcoming?.withinDays ?? 14} days`}
                value={upcoming?.count}
                total={counts?.total}
                alert={(upcoming?.count ?? 0) > 0}
              />
            </dl>
          </div>
        </Panel>
        <NextDeadlineCard tender={next} loading={shell.loading} onUpload={onUploadClick} />
      </div>

      {summary && summary.recentTenders.length > 0 && (
        <Panel id="recent" icon="history" title="Recently uploaded" aside={<span className="panel-count">{summary.recentTenders.length}</span>}>
          <ul className="recent-cards">
            {summary.recentTenders.map((t) => {
              const due = formatDate(t.submissionDeadline);
              return (
                <li key={t.id}>
                  <Link to={`/tenders/${t.id}`} className="recent-card">
                    <span className="recent-card-top">
                      <span className="recent-card-title">{displayTitle(t.title)}</span>
                      <AttentionBadge state={deriveAttentionState(t)} />
                    </span>
                    <span className="recent-card-text">{due ? `Due ${due}` : 'No deadline found yet'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel id="all-tenders" title="All tenders" aside={<span className="panel-count">{total}</span>}>
        <div className="card">
        <div className="filters-bar">
          <input
            type="search"
            placeholder="Search tenders…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value as TenderStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            {TENDER_STATUSES.map((s) => <option key={s} value={s}>{humanizeEnum(s)}</option>)}
          </select>
          <select
            value={analysisStatus}
            onChange={(e) => { setAnalysisStatus(e.target.value as AnalysisStatus | ''); setPage(1); }}
          >
            <option value="">All analysis states</option>
            {ANALYSIS_STATUSES.map((s) => <option key={s} value={s}>{humanizeEnum(s)}</option>)}
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters}>Clear filters</button>
          )}
        </div>

        {listError && (
          <EmptyState title="Could not load tenders" message={listError} action={{ label: 'Retry', onClick: fetchList }} />
        )}

        {!listError && listLoading && <p className="muted">Loading tenders…</p>}

        {!listError && !listLoading && total === 0 && !hasActiveFilters && (
          <EmptyState
            title="No tenders yet"
            message="Upload your first tender to get started."
            action={{ label: 'Upload tender', onClick: onUploadClick }}
          />
        )}

        {!listError && !listLoading && total === 0 && hasActiveFilters && (
          <EmptyState
            title="No tenders match your filters"
            action={{ label: 'Clear filters', onClick: clearFilters }}
          />
        )}

        {!listError && !listLoading && tenders.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="tender-table tender-table-cards">
                <thead>
                  <tr>
                    <th>Tender</th>
                    <th aria-sort={sortBy === 'deadline' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => onSort('deadline')}>
                        Deadline {sortBy === 'deadline' ? (sortOrder === 'asc' ? '\u2191' : '\u2193') : ''}
                      </button>
                    </th>
                    <th>Status</th>
                    <th><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {tenders.map((t) => (
                    <TenderRow key={t.id} tender={t} companyId={companyId} onUpdate={handleRowUpdate} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="muted">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
        </div>
      </Panel>
    </div>
  );
}

/** The free trial or monthly plan, from allowance.ts's wording. */
function AllowanceBanner({ allowance }: { allowance: Allowance }) {
  const n = allowanceNotice(allowance);
  const subject = n.next === 'renew' ? 'Renew my TenderTez plan' : 'TenderTez monthly plan';
  return (
    <div className={n.tone === 'info' ? 'notice notice-info' : 'notice'}>
      <span className="notice-text">
        {n.before}<strong>{n.bold}</strong>{n.after}
        {n.next === 'pricing' && <> <Link to="/pricing">See the plans</Link>.</>}
        {n.next && CONTACT_EMAIL && (
          <> Email <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}>{CONTACT_EMAIL}</a>.</>
        )}
      </span>
    </div>
  );
}

/** A count with a ten-step bar showing its share of all tenders; the exact
 *  number is always printed beside it. */
function GlanceRow({ icon, label, value, total, alert = false }: {
  icon: IconName; label: string; value: number | undefined; total?: number; alert?: boolean;
}) {
  const filled = value !== undefined && total ? Math.round((value / total) * 10) : 0;
  return (
    <div className={`fact-row${alert ? ' fact-row-alert' : ''}`}>
      <dt className="fact-label"><Icon name={icon} />{label}</dt>
      <dd className="fact-value fact-value-bar">
        {total !== undefined && (
          <span className="mini-bar" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < filled ? 'mini-bar-on' : ''} />)}
          </span>
        )}
        <span className="fact-number">{value ?? '…'}</span>
      </dd>
    </div>
  );
}

/** The dark card: the nearest deadline among this company's tenders. */
function NextDeadlineCard({ tender, loading, onUpload }: {
  tender: { id: string; title: string | null; organization: string | null; submissionDeadline: string | null } | null;
  loading: boolean;
  onUpload: () => void;
}) {
  const days = tender ? daysUntil(tender.submissionDeadline) : null;
  return (
    <section className="feature-card" aria-labelledby="next-deadline-heading">
      <p className="feature-pill"><Icon name="calendar" />Next deadline</p>
      <h2 id="next-deadline-heading" className="visually-hidden">Next deadline</h2>
      {tender && days !== null ? (
        <>
          <p className="feature-figure">
            <span className="feature-figure-value">{days === 0 ? 'Today' : days}</span>
            {days > 0 && <span className="feature-figure-unit">{days === 1 ? 'day left' : 'days left'}</span>}
          </p>
          <p className="feature-headline">{displayTitle(tender.title)}</p>
          <p className="feature-byline">
            {tender.organization ? `${tender.organization}. ` : ''}Submit by {formatDate(tender.submissionDeadline)}.
          </p>
          <Link to={`/tenders/${tender.id}`} className="btn-pill"><Icon name="arrowRight" />Open the tender</Link>
        </>
      ) : (
        <>
          <p className="feature-figure"><span className="feature-figure-value">—</span></p>
          <p className="feature-headline">{loading ? 'Loading…' : 'No upcoming deadlines'}</p>
          <p className="feature-byline">Deadlines appear here once a tender has been analysed.</p>
          <button type="button" className="btn-pill" onClick={onUpload}><Icon name="upload" />Upload a tender</button>
        </>
      )}
      <p className="feature-foot">Dates are read from each tender document.</p>
    </section>
  );
}
