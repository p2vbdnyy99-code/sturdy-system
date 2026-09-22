import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { TenderRow } from '../dashboard/TenderRow';
import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import { getDashboardSummary, type DashboardSummary } from '../api/dashboard';
import {
  listTenders, uploadTender, TENDER_STATUSES, ANALYSIS_STATUSES,
  type TenderListItem, type TenderStatus, type AnalysisStatus,
} from '../api/tenders';

const PAGE_SIZE = 20;

export function DashboardPage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string; // CompanyGate guarantees this

  // Summary tiles — independent fetch from the tender list below.
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      setSummary(await getDashboardSummary(companyId));
    } catch (err) {
      setSummaryError(err instanceof ApiError ? err.message : 'Could not load the dashboard summary.');
    } finally {
      setSummaryLoading(false);
    }
  }, [companyId]);

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

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
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

  return (
    <div>
      <AppHeader />
      <div className="page-body">
        <div className="dashboard-header-row">
          <h1>Dashboard</h1>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={onFileSelected}
              className="visually-hidden"
            />
            <button type="button" className="btn-primary" onClick={onUploadClick} disabled={uploading}>
              {uploading ? 'Uploading…' : '+ Upload Tender'}
            </button>
          </div>
        </div>
        {uploadError && <p role="alert" className="error-text">{uploadError}</p>}

        {summaryError && <p role="alert" className="error-text">{summaryError}</p>}
        {!summaryError && (
          <>
            <div className="dashboard-tiles">
              <SummaryTile label="Total tenders" value={summary?.totalTenders} loading={summaryLoading} />
              <SummaryTile label="Processing" value={summary?.processing} loading={summaryLoading} />
              <SummaryTile label="Awaiting analysis" value={summary?.awaitingAnalysis} loading={summaryLoading} />
              <SummaryTile label="Analysed" value={summary?.analysed} loading={summaryLoading} />
              <SummaryTile
                label={`Upcoming deadlines (${summary?.upcomingDeadlines.withinDays ?? 14}d)`}
                value={summary?.upcomingDeadlines.count}
                loading={summaryLoading}
              />
            </div>
            {summary && summary.recentTenders.length > 0 && (
              <ul className="dashboard-recent">
                {summary.recentTenders.map((t) => (
                  <li key={t.id}>
                    <span>{t.title || 'Untitled tender'}</span>
                    <span className="muted">
                      {t.submissionDeadline ? new Date(t.submissionDeadline).toLocaleDateString() : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="filters-bar">
          <input
            type="search"
            placeholder="Search tenders…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value as TenderStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            {TENDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={analysisStatus}
            onChange={(e) => { setAnalysisStatus(e.target.value as AnalysisStatus | ''); setPage(1); }}
          >
            <option value="">All analysis states</option>
            {ANALYSIS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
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
            action={{ label: '+ Upload Tender', onClick: onUploadClick }}
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
              <table className="tender-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Organization</th>
                    <th><button type="button" onClick={() => onSort('deadline')}>Deadline</button></th>
                    <th>Status</th>
                    <th>Action</th>
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
    </div>
  );
}

function SummaryTile({ label, value, loading }: { label: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="dashboard-tile">
      <div className="dashboard-tile-value">{loading ? '…' : (value ?? 0)}</div>
      <div className="dashboard-tile-label">{label}</div>
    </div>
  );
}
