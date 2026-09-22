import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { AttentionBadge } from '../components/AttentionBadge';
import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import { checkEligibility, getTender, type TenderDetail as TenderDetailType } from '../api/tenders';
import { deriveAttentionState } from '../dashboard/attentionState';
import { useTenderPolling, type PollTarget } from '../dashboard/useTenderPolling';
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

  // Live-refresh while this tender is still processing/analyzing — without
  // this, someone linking straight to /tenders/:id (not via the dashboard
  // row, which already polls) would see a stale in-progress state until
  // they manually reloaded. Same bounded 2s/120s polling as TenderRow.tsx,
  // no new mechanism.
  const isProcessing = !!tender
    && (tender.processingStatus === 'UPLOADED' || tender.processingStatus === 'PROCESSING' || tender.processingStatus === 'EXTRACTING');
  const isAnalyzing = !!tender && tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'ANALYZING';
  const pollTarget: PollTarget = isProcessing ? 'processing' : 'analysis';
  const [pollRetryKey, setPollRetryKey] = useState(0);
  const pollState = useTenderPolling((isProcessing || isAnalyzing) ? (id ?? null) : null, companyId, pollTarget, pollRetryKey);

  useEffect(() => {
    if (pollState?.status === 'settled') setTender(pollState.tender);
  }, [pollState]);

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
          <TenderDetailBody
            tender={tender}
            tab={tab}
            onTabChange={setTab}
            companyId={companyId}
            onRefetch={fetchTender}
            pollTimedOut={pollState?.status === 'timeout'}
            onPollRetry={() => setPollRetryKey((k) => k + 1)}
          />
        )}
      </div>
    </div>
  );
}

// Real backend enum values only — never a fabricated percentage or step
// count (see the Beta Readiness milestone's "no fake progress" rule). Each
// label states exactly what processingStatus/analysisStatus already is.
const PROCESSING_STAGE_LABELS: Record<TenderDetailType['processingStatus'], string> = {
  UPLOADED: 'Upload received, queued for processing.',
  PROCESSING: 'Extracting pages from the document…',
  EXTRACTING: 'Extracting pages from the document…',
  // ANALYZING is a deprecated processingStatus value the backend never
  // actually sets (see dashboard/attentionState.ts) — covered only so this
  // Record's type checks against the full enum.
  ANALYZING: 'Extracting pages from the document…',
  COMPLETED: 'Document processed.',
  FAILED: 'Document processing failed.',
};

function TenderDetailBody({
  tender, tab, onTabChange, companyId, onRefetch, pollTimedOut, onPollRetry,
}: {
  tender: TenderDetailType;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  companyId: string;
  onRefetch: () => void;
  pollTimedOut: boolean;
  onPollRetry: () => void;
}) {
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  async function onCheckEligibility() {
    setEligibilityError(null);
    setCheckingEligibility(true);
    try {
      await checkEligibility(tender.id, companyId);
      onRefetch();
    } catch (err) {
      setEligibilityError(err instanceof ApiError ? err.message : 'Could not check eligibility.');
    } finally {
      setCheckingEligibility(false);
    }
  }

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

      {tender.processingStatus !== 'COMPLETED' && (
        <p className="notice">{PROCESSING_STAGE_LABELS[tender.processingStatus]}</p>
      )}
      {tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'ANALYZING' && (
        <p className="notice">Analyzing the document against your requirements checklist…</p>
      )}
      {tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'NOT_STARTED' && (
        <p className="notice">
          Extraction is done, but analysis hasn't been run yet — the tabs below have nothing to show
          until it is.
        </p>
      )}
      {tender.analysisStatus === 'COMPLETED' && (
        <p className="notice">
          The tabs below show only what was actually extracted — not the absence of a finding.
        </p>
      )}
      {pollTimedOut && (
        <p className="muted">
          Still working — refresh or{' '}
          <button type="button" onClick={onPollRetry}>check again</button>.
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
        {tab === 'requirements' && (
          <div>
            {tender.analysisStatus === 'COMPLETED' && tender.requirements.length > 0 && (
              <div className="eligibility-action-bar">
                <button type="button" className="btn-primary" onClick={onCheckEligibility} disabled={checkingEligibility}>
                  {checkingEligibility ? 'Checking against your profile…' : 'Check eligibility against your profile'}
                </button>
                <span className="muted eligibility-action-hint">
                  Cross-checks each requirement against your company profile — never a value the AI made up.
                </span>
              </div>
            )}
            {eligibilityError && <p role="alert" className="error-text">{eligibilityError}</p>}
            <RequirementsTab requirements={tender.requirements} />
          </div>
        )}
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
