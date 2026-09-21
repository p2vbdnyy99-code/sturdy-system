import { useEffect, useState } from 'react';
import { analyzeTender, type TenderListItem } from '../api/tenders';
import { ApiError } from '../api/client';
import { deriveAttentionState } from './attentionState';
import { useTenderPolling, type PollTarget } from './useTenderPolling';
import { AttentionBadge } from '../components/AttentionBadge';

type TenderRowProps = {
  tender: TenderListItem;
  companyId: string;
  onUpdate: (tenderId: string, patch: Partial<TenderListItem>) => void;
};

function formatDeadline(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function TenderRow({ tender, companyId, onUpdate }: TenderRowProps) {
  const attention = deriveAttentionState(tender);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const pollTarget: PollTarget = attention === 'ANALYSIS_IN_PROGRESS' ? 'analysis' : 'processing';
  const shouldPoll = attention === 'PROCESSING' || attention === 'ANALYSIS_IN_PROGRESS';
  const pollState = useTenderPolling(shouldPoll ? tender.id : null, companyId, pollTarget, retryKey);

  useEffect(() => {
    if (pollState?.status !== 'settled') return;
    const detail = pollState.tender;
    // The typed (parsed) deadline only — never pass a non-calendar raw-text
    // fallback into a date comparison. Mirrors repo/analysis.js's own
    // "keep parsed, else null" rule (see attentionState.ts's doc comment).
    const rawDeadline = detail.overview.submissionDeadline?.value ?? null;
    const submissionDeadline = rawDeadline && !Number.isNaN(Date.parse(rawDeadline)) ? rawDeadline : null;
    onUpdate(tender.id, {
      processingStatus: detail.processingStatus,
      analysisStatus: detail.analysisStatus,
      submissionDeadline,
    });
    // Deliberately keyed on pollState alone — onUpdate/tender.id are stable
    // identities for a given row and re-running this on every render would
    // just re-dispatch the same settled result repeatedly.
  }, [pollState]);

  async function onAnalyzeClick() {
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      await analyzeTender(tender.id, companyId);
      onUpdate(tender.id, { analysisStatus: 'ANALYZING' });
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : 'Could not start analysis.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <tr>
      <td>{tender.title || 'Untitled tender'}</td>
      <td>{tender.organization || '—'}</td>
      <td>{formatDeadline(tender.submissionDeadline)}</td>
      <td><AttentionBadge state={attention} /></td>
      <td>
        {(attention === 'ANALYSIS_REQUIRED' || attention === 'ANALYSIS_FAILED') && (
          <button type="button" onClick={onAnalyzeClick} disabled={analyzing}>
            {analyzing ? 'Starting…' : attention === 'ANALYSIS_FAILED' ? 'Retry analysis' : 'Analyze'}
          </button>
        )}
        {analyzeError && <p role="alert" className="error-text">{analyzeError}</p>}
        {pollState?.status === 'timeout' && (
          <p className="muted">
            Still {pollTarget === 'processing' ? 'processing' : 'analyzing'} — refresh or try again later.{' '}
            <button type="button" onClick={() => setRetryKey((k) => k + 1)}>Check again</button>
          </p>
        )}
      </td>
    </tr>
  );
}
