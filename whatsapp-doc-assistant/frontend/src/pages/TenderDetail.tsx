import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumb, Panel } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { AttentionBadge } from '../components/AttentionBadge';
import { useSession } from '../auth/SessionProvider';
import { ApiError } from '../api/client';
import { analyzeTender, checkEligibility, getTender, type TenderDetail as TenderDetailType } from '../api/tenders';
import { deriveAttentionState } from '../dashboard/attentionState';
import { useTenderPolling, type PollTarget } from '../dashboard/useTenderPolling';
import { OverviewTab } from '../tenderDetail/OverviewTab';
import { RequirementsTab } from '../tenderDetail/RequirementsTab';
import { BoqTab } from '../tenderDetail/BoqTab';
import { DatesTab } from '../tenderDetail/DatesTab';
import { RedFlagsTab } from '../tenderDetail/RedFlagsTab';
import { DocumentTab } from '../tenderDetail/DocumentTab';
import { KeyFacts } from '../tenderDetail/KeyFacts';
import { DatesTimeline } from '../tenderDetail/DatesTimeline';
import { DeadlineCard } from '../tenderDetail/DeadlineCard';
import { BidPanel } from '../tenderDetail/BidPanel';
import { SecuritiesPanel } from '../tenderDetail/SecuritiesPanel';
import { ChecklistTab } from '../tenderDetail/ChecklistTab';
import { CorrigendaTab } from '../tenderDetail/CorrigendaTab';
import { AnnexuresTab } from '../tenderDetail/AnnexuresTab';
import { STAGE_LABEL } from '../tenderDetail/stages';
import { biddingStatus } from '../tenderDetail/biddingStatus';
import { AttachDocumentNotice } from '../tenderDetail/AttachDocumentNotice';
import { eligibilityWasChecked } from '../tenderDetail/deadlineSummary';
import { Icon } from '../components/Icon';
import { useShellData } from '../shell/ShellData';
import { displayTitle, formatDate } from '../format';

type TabKey = 'overview' | 'requirements' | 'checklist' | 'annexures' | 'boq' | 'dates' | 'redFlags' | 'corrigenda' | 'document';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'annexures', label: 'Annexures' },
  { key: 'boq', label: 'BOQ' },
  { key: 'dates', label: 'Dates' },
  { key: 'redFlags', label: 'Red flags' },
  { key: 'corrigenda', label: 'Corrigenda' },
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

  const { reload: reloadShell } = useShellData();
  useEffect(() => {
    if (pollState?.status !== 'settled') return;
    setTender(pollState.tender);
    reloadShell(); // the queue's deadline and the plan allowance may have changed
  }, [pollState, reloadShell]);

  return (
    <>
      {loading && (
        <>
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tender' }]} />
          <p className="muted">Loading tender…</p>
        </>
      )}

      {!loading && error && (
        <>
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tender' }]} />
          <EmptyState title={error} action={{ label: 'Retry', onClick: fetchTender }} />
        </>
      )}

      {!loading && !error && tender && (
        <TenderDetailBody
          tender={tender}
          tab={tab}
          onTabChange={setTab}
          companyId={companyId}
          onRefetch={fetchTender}
          onPatch={(patch) => setTender((t) => (t ? { ...t, ...patch } : t))}
          pollTimedOut={pollState?.status === 'timeout'}
          onPollRetry={() => setPollRetryKey((k) => k + 1)}
        />
      )}
    </>
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
  tender, tab, onTabChange, companyId, onRefetch, onPatch, pollTimedOut, onPollRetry,
}: {
  tender: TenderDetailType;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  companyId: string;
  onRefetch: () => void;
  onPatch: (patch: Partial<TenderDetailType>) => void;
  pollTimedOut: boolean;
  onPollRetry: () => void;
}) {
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [analysisStartError, setAnalysisStartError] = useState<string | null>(null);
  const shell = useShellData();

  async function onRunAnalysis() {
    setAnalysisStartError(null);
    setStartingAnalysis(true);
    try {
      await analyzeTender(tender.id, companyId);
      onRefetch(); // reloads as ANALYZING, which starts the page's polling
      shell.reload(); // the queue and the plan allowance change too
    } catch (err) {
      if (err instanceof ApiError && err.code === 'profile_incomplete') shell.profile.openDialog();
      else setAnalysisStartError(err instanceof ApiError ? err.message : 'Could not start analysis.');
    } finally {
      setStartingAnalysis(false);
    }
  }

  const counts: Partial<Record<TabKey, number>> = tender.analysisStatus === 'COMPLETED'
    ? { requirements: tender.requirements.length, boq: tender.boq.length, dates: tender.dates.length, redFlags: tender.redFlags.length }
    : {};
  const organization = tender.overview.organization?.value;
  const tenderNumber = tender.overview.tenderNumber?.value;
  const location = tender.overview.location?.value;
  const duration = tender.overview.contractDuration?.value;
  const completed = tender.analysisStatus === 'COMPLETED';
  const deadline = tender.overview.submissionDeadline?.value ?? null;

  function openTab(key: TabKey) {
    onTabChange(key);
    document.getElementById('tender-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const uploaded = formatDate(tender.createdAt);
  const analysed = formatDate(tender.analyzedAt);

  const runAnalysisButton = (label: string) => (
    <button type="button" className="btn-primary notice-action" onClick={onRunAnalysis} disabled={startingAnalysis}>
      {startingAnalysis ? 'Starting…' : label}
    </button>
  );

  const coverage = tender.analysisCoverage;
  const partial = tender.analysisStatus === 'COMPLETED' && coverage !== null && coverage.failedSections > 0;

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
      <header className="page-head">
        <div className="page-head-text">
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: displayTitle(tender.title) }]} />
          <h1 className="page-title">{displayTitle(tender.title)}</h1>
          <p className="page-meta">
            {organization && <span>{organization}</span>}
            {tender.pageCount > 0 && <span>{tender.pageCount} pages</span>}
            {uploaded && <span>Uploaded {uploaded}</span>}
          </p>
          <ul className="chips" aria-label="At a glance">
            {completed && tender.redFlags.length > 0 && (
              <li>
                <button type="button" className="chip chip-danger" onClick={() => openTab('redFlags')}>
                  <Icon name="alert" />{tender.redFlags.length} {tender.redFlags.length === 1 ? 'red flag' : 'red flags'}
                </button>
              </li>
            )}
            {tender.status !== 'NEW' && <li><span className="chip chip-stage">{STAGE_LABEL[tender.status]}</span></li>}
            <li><AttentionBadge state={attention} /></li>
            {(() => {
              const b = biddingStatus(deadline && !Number.isNaN(Date.parse(deadline)) ? deadline : null);
              return b && <li><span className={`chip chip-bidding-${b.tone}`} title="From the deadline in the document">{b.label}</span></li>;
            })()}
            {tenderNumber && <li><span className="chip"><Icon name="file" />{tenderNumber}</span></li>}
            {tender.portalUrl && (
              <li>
                <a className="chip chip-link" href={tender.portalUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="globe" />{tender.portalRef || 'Open on the portal'} ↗
                </a>
              </li>
            )}
            {!tender.portalUrl && tender.portalRef && <li><span className="chip"><Icon name="globe" />{tender.portalRef}</span></li>}
            {location && <li><span className="chip">{location}</span></li>}
            {duration && <li><span className="chip">{duration}</span></li>}
          </ul>
        </div>
        {completed && tender.requirements.length > 0 && (
          <div className="page-head-action">
            <button type="button" className="btn-primary btn-large" onClick={onCheckEligibility} disabled={checkingEligibility}>
              <Icon name="check" />
              {checkingEligibility ? 'Checking against your profile…' : 'Check eligibility'}
            </button>
          </div>
        )}
      </header>
      {eligibilityError && <p role="alert" className="error-text">{eligibilityError}</p>}

      {tender.processingStatus !== 'COMPLETED' && tender.processingStatus !== 'FAILED' && (
        <div className="notice notice-info notice-progress">
          <span className="notice-spinner" aria-hidden="true" />
          <span className="notice-text">{PROCESSING_STAGE_LABELS[tender.processingStatus]}</span>
        </div>
      )}
      {tender.processingStatus === 'FAILED' && (
        <div className="notice notice-danger">
          <Icon name="alert" />
          <span className="notice-text">
            {tender.processingError || PROCESSING_STAGE_LABELS.FAILED} To try again, upload the PDF again
            from the dashboard.
          </span>
        </div>
      )}
      {tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'ANALYZING' && (
        <div className="notice notice-info notice-progress">
          <span className="notice-spinner" aria-hidden="true" />
          <span className="notice-text">Analyzing the document against your requirements checklist…</span>
        </div>
      )}
      {!tender.document && <AttachDocumentNotice tender={tender} companyId={companyId} onAttached={onRefetch} />}
      {tender.document && tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'NOT_STARTED' && (
        <div className="notice notice-info">
          <Icon name="info" />
          <span className="notice-text">
            Extraction is done, but analysis hasn't been run yet — the tabs below have nothing to show
            until it is.
          </span>
          {runAnalysisButton('Analyze')}
        </div>
      )}
      {tender.processingStatus === 'COMPLETED' && tender.analysisStatus === 'FAILED' && (
        <div className="notice notice-danger">
          <Icon name="alert" />
          <span className="notice-text">Analysis failed{tender.analysisError ? `: ${tender.analysisError}` : '.'}</span>
          {runAnalysisButton('Retry analysis')}
        </div>
      )}
      {partial && coverage && (
        <div className="notice notice-danger">
          <Icon name="alert" />
          <span className="notice-text">
            {coverage.failedSections} of {coverage.sections} sections of this document couldn&rsquo;t be
            read, so some details (possibly the deadline or EMD) may be missing below.
          </span>
          {runAnalysisButton('Re-run analysis')}
        </div>
      )}
      {analysisStartError && <p role="alert" className="error-text">{analysisStartError}</p>}
      {pollTimedOut && (
        <p className="muted">
          Still working — refresh or{' '}
          <button type="button" onClick={onPollRetry}>check again</button>.
        </p>
      )}

      {completed && (
        <div className="grid-main-side">
          <Panel id="key-facts" title="Key facts" aside={analysed ? <span className="muted">Analysed {analysed}</span> : undefined}>
            <div className="card"><KeyFacts overview={tender.overview} /></div>
          </Panel>
          <DeadlineCard
            deadline={deadline}
            requirements={tender.requirements}
            eligibilityChecked={eligibilityWasChecked(tender.activity)}
            forClient={Boolean(tender.clientId)}
            onOpenRequirements={() => openTab('requirements')}
          />
        </div>
      )}

      <div className="grid-main-side">
        <Panel
          id="tender-details"
          title="Details"
          aside={completed && !partial ? <span className="muted">Only what was found in the document</span> : undefined}
        >
          <div className="card">
            <div className="tab-bar" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={t.key === tab}
                  className={t.key === tab ? 'tab-active' : ''}
                  onClick={() => onTabChange(t.key)}
                >
                  {t.label}
                  {counts[t.key] !== undefined && <span className="tab-count">{counts[t.key]}</span>}
                </button>
              ))}
            </div>

            <div className="tab-panel">
              {tab === 'overview' && <OverviewTab tender={tender} />}
              {tab === 'requirements' && (
                <div>
                  {completed && tender.requirements.length > 0 && (
                    <p className="muted eligibility-action-hint">
                      &ldquo;Check eligibility&rdquo; at the top compares each requirement with your company
                      profile, never with a value the AI made up.
                    </p>
                  )}
                  <RequirementsTab requirements={tender.requirements} />
                </div>
              )}
              {tab === 'checklist' && <ChecklistTab tenderId={tender.id} companyId={companyId} analysed={completed} />}
              {tab === 'annexures' && (
                <AnnexuresTab tenderId={tender.id} companyId={companyId} clientId={tender.clientId}
                  extracted={Boolean(tender.document) && tender.processingStatus === 'COMPLETED'} />
              )}
              {tab === 'boq' && <BoqTab items={tender.boq} />}
              {tab === 'dates' && <DatesTab dates={tender.dates} />}
              {tab === 'redFlags' && <RedFlagsTab redFlags={tender.redFlags} />}
              {tab === 'corrigenda' && <CorrigendaTab tenderId={tender.id} companyId={companyId} onApplied={onRefetch} />}
              {tab === 'document' && (
                <DocumentTab tenderId={tender.id} companyId={companyId} document={tender.document} />
              )}
            </div>
          </div>
        </Panel>
        <div className="side-stack">
          <BidPanel key={tender.id} tender={tender} companyId={companyId} onSaved={onPatch} />
          <SecuritiesPanel key={`sec-${tender.id}`} tenderId={tender.id} companyId={companyId} emdFromDocument={tender.overview.emd} />
          {completed && (
            <Panel id="key-dates" title="Key dates" aside={<span className="panel-count">{tender.dates.length}</span>}>
              <div className="card"><DatesTimeline dates={tender.dates} /></div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
