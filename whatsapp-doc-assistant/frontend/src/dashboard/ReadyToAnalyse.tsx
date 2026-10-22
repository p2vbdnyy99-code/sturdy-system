// The next step after an upload: tenders whose PDF is extracted but that
// were never analysed (the dashboard summary's readyToAnalyse). A tender
// shows nothing useful until it is analysed, and the row's own Analyze button
// sits at the bottom of the page on a phone, so the dashboard puts these
// first. Analysis still starts only on this explicit click, exactly as from
// the row or the tender page; the button then opens the tender, which shows
// the analysis progress.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzeTender } from '../api/tenders';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { displayTitle } from '../format';
import { useShellData } from '../shell/ShellData';

export type ReadyTender = { id: string; title: string | null; clientId: string | null };

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
      else setError(err instanceof ApiError ? err.message : 'Could not start the analysis. Please try again.');
    } finally {
      setStarting(null);
    }
  }

  const one = tenders.length === 1;
  return (
    <section className="notice notice-info ready-analyse" aria-labelledby="ready-analyse-title">
      <Icon name="info" />
      <div className="notice-text">
        <h2 id="ready-analyse-title" className="ready-analyse-title">
          {one ? 'Your tender is ready to analyse' : `${tenders.length} tenders are ready to analyse`}
        </h2>
        <p className="ready-analyse-lead">
          Analysing lists the deadline, EMD, eligibility conditions and documents to submit, each with its page number.
        </p>
        <ul className="ready-analyse-list">
          {tenders.map((t) => {
            const client = t.clientId ? clientNames.get(t.clientId) : null;
            return (
              <li key={t.id}>
                <Link to={`/tenders/${t.id}`} className="ready-analyse-name">
                  {displayTitle(t.title)}{client ? ` (for ${client})` : ''}
                </Link>
                <button type="button" className="btn-primary" onClick={() => onAnalyze(t.id)} disabled={starting !== null}>
                  {starting === t.id ? 'Starting…' : 'Analyze'}
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="error-text">{error}</p>}
      </div>
    </section>
  );
}
