import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { AttentionBadge } from '../components/AttentionBadge';
import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import { getTender, type TenderDetail as TenderDetailType } from '../api/tenders';
import { deriveAttentionState } from '../dashboard/attentionState';
import { OverviewTab } from '../tenderDetail/OverviewTab';
import { RequirementsTab } from '../tenderDetail/RequirementsTab';
import { BoqTab } from '../tenderDetail/BoqTab';
import { DatesTab } from '../tenderDetail/DatesTab';
import { RedFlagsTab } from '../tenderDetail/RedFlagsTab';
import { DocumentTab } from '../tenderDetail/DocumentTab';

type TabKey = 'overview' | 'requirements' | 'boq' | 'dates' | 'redFlags' | 'document';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'boq', label: 'BOQ' },
  { key: 'dates', label: 'Dates' },
  { key: 'redFlags', label: 'Red Flags' },
  { key: 'document', label: 'Document' },
];

export function TenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string; // CompanyGate guarantees this

  const [tender, setTender] = useState<TenderDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  const fetchTender = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setTender(await getTender(id, companyId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Tender not found.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not load this tender.');
      }
    } finally {
      setLoading(false);
    }
  }, [id, companyId]);

  useEffect(() => { fetchTender(); }, [fetchTender]);

  return (
    <div>
      <AppHeader />
      <div className="page-body">
        <p><Link to="/dashboard">&larr; Back to dashboard</Link></p>

        {loading && <p className="muted">Loading tender…</p>}

        {!loading && error && (
          <EmptyState title={error} action={{ label: 'Retry', onClick: fetchTender }} />
        )}

        {!loading && !error && tender && (
          <TenderDetailBody tender={tender} tab={tab} onTabChange={setTab} companyId={companyId} />
        )}
      </div>
    </div>
  );
}

function TenderDetailBody({
  tender, tab, onTabChange, companyId,
}: {
  tender: TenderDetailType;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  companyId: string;
}) {
  const attention = deriveAttentionState({
    processingStatus: tender.processingStatus,
    analysisStatus: tender.analysisStatus,
    // The list endpoint's submissionDeadline column isn't part of this
    // response shape — overview.submissionDeadline carries the same typed
    // value when it parsed (see TenderRow.tsx for the identical guard).
    submissionDeadline:
      tender.overview.submissionDeadline?.value
      && !Number.isNaN(Date.parse(tender.overview.submissionDeadline.value))
        ? tender.overview.submissionDeadline.value
        : null,
  });

  return (
    <div>
      <div className="dashboard-header-row">
        <h1>{tender.title || 'Untitled tender'}</h1>
        <AttentionBadge state={attention} />
      </div>

      {tender.analysisStatus !== 'COMPLETED' && (
        <p className="notice">
          Analysis is not yet complete for this tender — the tabs below only show what has actually
          been extracted so far, not the absence of a finding.
        </p>
      )}

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? 'tab-active' : ''}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === 'overview' && <OverviewTab tender={tender} />}
        {tab === 'requirements' && <RequirementsTab requirements={tender.requirements} />}
        {tab === 'boq' && <BoqTab items={tender.boq} />}
        {tab === 'dates' && <DatesTab dates={tender.dates} />}
        {tab === 'redFlags' && <RedFlagsTab redFlags={tender.redFlags} />}
        {tab === 'document' && (
          <DocumentTab tenderId={tender.id} companyId={companyId} document={tender.document} />
        )}
      </div>
    </div>
  );
}
