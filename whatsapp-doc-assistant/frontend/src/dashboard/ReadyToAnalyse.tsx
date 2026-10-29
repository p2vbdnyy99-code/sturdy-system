// Tenders whose PDF has been read but that were never analysed (the
// dashboard summary's readyToAnalyse). Usually the analysis starts by itself
// after upload (backend analysis/start.js); a tender lands here when it
// couldn't start (the profile is needed, the free or plan tenders are used,
// today's limit was reached) or was uploaded without the automatic start.
// The server says why (blockedBy), so each row offers the next step instead
// of a button that would only fail. Analyze opens the tender, which shows
// the analysis progress.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeTender } from '../api/tenders';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { displayTitle } from '../format';
import { useShellData } from '../shell/ShellData';
import { CONTACT_EMAIL } from '../config/site';
import { blockedText, type BlockedBy } from './firstRun';
import { allowanceNotice } from '../allowance';

export type ReadyTender = { id: string; title: string | null; clientId: string | null; blockedBy?: BlockedBy };

export function ReadyToAnalyse({ tenders, companyId, clientNames }: {
  tenders: ReadyTender[];
  companyId: string;
  clientNames: Map<string, string>;
}) {
  const navigate = useNavigate();
  const shell = useShellData();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (tenders.length === 0) return null;

  async function onAnalyze(id: string) {
    setError(null);
    setStarting(id);
    try {
      await analyzeTender(id, companyId);
      shell.reload();
      navigate(`/tenders/${id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'profile_incomplete') shell.profile.openDialog();
      // Started a moment ago (by itself or in another tab): show its progress.
      else if (err instanceof ApiError && err.code === 'already_running') { shell.reload(); navigate(`/tenders/${id}`); }
      else setError(err instanceof ApiError ? err.message : 'Could not start the analysis. Please try again.');
    } finally {
      setStarting(null);
    }
  }

  const one = tenders.length === 1;
  const allowance = shell.summary?.allowance;
  const currentAllowance = allowance === undefined ? null : allowance === null ? 'no limit on new tenders.'
    : (({ before, bold, after }) => `${before}${bold}${after}`)(allowanceNotice(allowance));
  return (
    <section className="notice notice-info ready-analyse" aria-labelledby="ready-analyse-title">
      <Icon name="info" />
      <div className="notice-text">
        <h2 id="ready-analyse-title" className="ready-analyse-title">
          {one ? 'This tender has been read but not analysed' : `${tenders.length} tenders have been read but not analysed`}
        </h2>
        <p className="ready-analyse-lead">
          Analysing lists the deadline, EMD, eligibility conditions and documents to submit, each with its page number.
        </p>
        <ul className="ready-analyse-list">
          {tenders.map((t) => {
            const client = t.clientId ? clientNames.get(t.clientId) : null;
            const why = blockedText(t.blockedBy ?? null);
            // Shown with "your free trial or plan changed": what the user has now.
            const now = why.next === 'confirm' ? currentAllowance : null;
            return (
              <li key={t.id}>
                <span className="ready-analyse-item">
                  <Link to={`/tenders/${t.id}`} className="ready-analyse-name">
                    {displayTitle(t.title)}{client ? ` (for ${client})` : ''}
                  </Link>
                  {why.next && <span className="ready-analyse-why">{why.text}{now ? ` Now: ${now}` : ''}</span>}
                </span>
                {(why.next === null || why.next === 'confirm') && (
                  <button type="button" className="btn-primary" onClick={() => onAnalyze(t.id)} disabled={starting !== null}>
                    {starting === t.id ? 'Starting…' : 'Analyze'}
                  </button>
                )}
                {why.next === 'profile' && (
                  <button type="button" className="btn-primary" onClick={() => shell.profile.openDialog()}>Complete profile</button>
                )}
                {why.next === 'pricing' && <Link to="/pricing" className="btn-link btn-primary">See the plans</Link>}
                {why.next === 'contact' && CONTACT_EMAIL && (
                  <a className="btn-link btn-primary" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('TenderTez plan')}`}>Contact us</a>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="error-text">{error}</p>}
      </div>
    </section>
  );
}
