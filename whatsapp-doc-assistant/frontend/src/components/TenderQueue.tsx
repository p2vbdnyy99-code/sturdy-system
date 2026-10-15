import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { useShellData } from '../shell/ShellData';
import { dueLabel, filterQueue, isDueSoon, type QueueMode } from '../shell/queue';
import { deriveAttentionState, ATTENTION_LABELS } from '../dashboard/attentionState';
import { displayTitle } from '../format';
import { STAGE_LABEL } from '../tenderDetail/stages';
import type { Allowance } from '../allowance';
import { Icon } from './Icon';

// The left panel: the company, its tenders in deadline order (like a clinic's
// patient queue), and how much of the plan is used. Every figure comes from
// the API; nothing here is estimated.
export function TenderQueue({ activeTenderId, onNavigate }: { activeTenderId?: string; onNavigate?: () => void }) {
  const { me, selectedCompanyId } = useSession();
  const { tenders, total, summary, loading, error, reload } = useShellData();
  // null until the user picks a tab: then "Due soon", unless nothing is due
  // soon or the open tender isn't, so the open tender is always in the list.
  const [mode, setMode] = useState<QueueMode | null>(null);
  const [query, setQuery] = useState('');
  const company = me?.companies.find((c) => c.companyId === selectedCompanyId);

  const dueSoonCount = tenders.filter((t) => isDueSoon(t.submissionDeadline)).length;
  const active = tenders.find((t) => t.id === activeTenderId);
  const effectiveMode: QueueMode = mode
    ?? ((!loading && dueSoonCount === 0) || (active && !isDueSoon(active.submissionDeadline)) ? 'all' : 'dueSoon');
  const shown = filterQueue(tenders, effectiveMode, query);

  return (
    <div className="queue">
      <div className="queue-company">
        <h2 className="queue-company-name">{company?.name ?? 'Your company'}</h2>
        <p className="queue-company-sub">{planLine(summary?.allowance ?? null)}</p>
      </div>

      <div className="segmented" role="group" aria-label="Which tenders to show">
        <button type="button" aria-pressed={effectiveMode === 'dueSoon'} onClick={() => setMode('dueSoon')}>
          Due soon <span className="segmented-count">{dueSoonCount}</span>
        </button>
        <button type="button" aria-pressed={effectiveMode === 'all'} onClick={() => setMode('all')}>
          All <span className="segmented-count">{total}</span>
        </button>
      </div>

      <label className="queue-search">
        <Icon name="search" />
        <span className="visually-hidden">Find a tender</span>
        <input type="search" placeholder="Find a tender" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && <p role="alert" className="error-text queue-note">{error} <button type="button" className="link-button" onClick={reload}>Retry</button></p>}
      {loading && <p className="muted queue-note">Loading…</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="muted queue-note">{tenders.length === 0 ? 'No tenders yet. Upload one from the dashboard.' : 'No tenders match.'}</p>
      )}

      <ul className="queue-list">
        {shown.map((t) => {
          const due = dueLabel(t.submissionDeadline);
          const active = t.id === activeTenderId;
          return (
            <li key={t.id}>
              <Link
                to={`/tenders/${t.id}`}
                className={`queue-item${active ? ' queue-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className={`queue-chip queue-chip-${due.tone}`} title={due.title}>{due.text}</span>
                <span className="queue-item-text">
                  <span className="queue-item-title">{displayTitle(t.title)}</span>
                  <span className="queue-item-sub">
                    {t.status !== 'NEW' && <span className="queue-stage">{STAGE_LABEL[t.status]}</span>}
                    {t.organization || ATTENTION_LABELS[deriveAttentionState(t)]}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {total > tenders.length && (
        <p className="muted queue-note">Showing the first {tenders.length} of {total}. <Link to="/dashboard">See all</Link></p>
      )}

      {summary?.allowance && <AllowanceCard allowance={summary.allowance} />}
    </div>
  );
}

function planLine(a: Allowance | null): string {
  if (!a) return 'Tender workspace';
  if (a.kind === 'trial') return 'Free trial';
  return a.kind === 'plan_expired' ? `${a.planName} plan (ended)` : `${a.planName} plan`;
}

/** "3 of 5 tenders used", drawn as one segment per tender like a day's queue. */
function AllowanceCard({ allowance }: { allowance: Allowance }) {
  const { limit, used } = allowance;
  const segments = Array.from({ length: limit }, (_, i) => i < used);
  const caption = allowance.kind === 'trial' ? 'Free trial' : allowance.kind === 'plan' ? 'This month' : 'Plan ended';
  return (
    <div className="queue-allowance">
      <p className="queue-allowance-caption">{caption}</p>
      <p className="queue-allowance-figure"><strong>{used}</strong> of {limit} tenders used</p>
      <div className={`segments${limit > 15 ? ' segments-dense' : ''}`} aria-hidden="true">
        {segments.map((filled, i) => <span key={i} className={filled ? 'segment segment-filled' : 'segment'} />)}
      </div>
      <p className="queue-allowance-sub">
        {allowance.remaining > 0 ? `${allowance.remaining} left to analyse` : 'None left'}
        {allowance.kind !== 'trial' || allowance.remaining === 0 ? <> · <Link to="/pricing">Plans</Link></> : null}
      </p>
    </div>
  );
}
