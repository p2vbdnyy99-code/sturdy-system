import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  deleteSavedSearch, getFeed, listAlerts, listSavedSearches, markAlertsSeen, saveSearch, trackFeedTender,
  type AlertMatch, type FeedQuery, type FeedTender, type SavedSearch,
} from '../api/feed';
import { useSession } from '../auth/SessionProvider';
import { Breadcrumb, Panel } from '../components/AppShell';
import { useShellData } from '../shell/ShellData';
import { TenderBrowser, TenderRow } from '../tenders/TenderBrowser';
import { SourceNote } from '../tenders/SourceNote';
import { paramsFromQuery, queryFromParams } from '../tenders/browse';

// The tender feed inside the app: the same search as the public
// /government-tenders page, plus Track, which adds a tender to your tenders
// (you attach its PDF from the portal before it can be analysed), and saved
// searches: tenders the collector finds later that match one appear under
// "New for your searches" and as a count on the rail (repo/savedSearches.js).
export function FeedPage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string;
  const navigate = useNavigate();
  const shell = useShellData();
  const [params, setParams] = useSearchParams();
  const query = queryFromParams(params);
  const load = useCallback((q: FeedQuery) => getFeed(q), []);

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [matches, setMatches] = useState<AlertMatch[] | null>(null);
  // Matches that were unseen when this page opened keep their "New" tag
  // until the user leaves, although they are marked seen straight away.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { reload: reloadShell } = shell;

  const loadSaved = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([listSavedSearches(companyId), listAlerts(companyId)]);
      setSearches(s.searches);
      setMatches(a.matches);
      const unseen = a.matches.filter((m) => !m.seen).map((m) => m.matchId);
      if (unseen.length > 0) {
        setFreshIds((prev) => new Set([...prev, ...unseen]));
        await markAlertsSeen(companyId, unseen);
        reloadShell(); // the rail's count goes down
      }
    } catch {
      setMatches([]);
    }
  }, [companyId, reloadShell]);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  async function onTrack(t: FeedTender) {
    setBusy(t.id);
    try {
      const r = await trackFeedTender(t.id, companyId);
      shell.reload();
      navigate(`/tenders/${r.tenderId}`);
    } finally {
      setBusy(null);
    }
  }

  const hasFilter = query.kind !== 'all' || Boolean(query.state || query.organisation || query.search);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveSearch(companyId, {
        kind: query.kind, state: query.state, organisation: query.organisation, search: query.search,
      });
      setSearches((s) => [...s, saved]);
      setMessage({ ok: true, text: `Saved “${saved.name}”. New tenders that match it will show above and on the rail.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save this search.' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(s: SavedSearch) {
    setMessage(null);
    try {
      await deleteSavedSearch(companyId, s.id);
      setSearches((list) => list.filter((x) => x.id !== s.id));
      setMatches((list) => (list ? list.filter((m) => m.savedSearchId !== s.id) : list));
      reloadShell();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not delete this search.' });
    }
  }

  function openSearch(s: SavedSearch) {
    const f = s.filters;
    setParams(paramsFromQuery({ ...query, kind: f.kind, state: f.state, organisation: f.organisation, search: f.search, page: 1 }));
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tender feed' }]} />
          <h1 className="page-title">Tender feed</h1>
          <p className="page-meta"><span>Central, state and GeM tenders from CPPP</span></p>
        </div>
      </header>
      <SourceNote />

      {searches.length > 0 && (
        <Panel id="saved-searches" title="New for your searches" aside={<span className="panel-count">{searches.length} saved</span>}>
          <div className="card saved-card">
            <ul className="saved-list" aria-label="Your saved searches">
              {searches.map((s) => (
                <li key={s.id} className="saved-chip">
                  <button type="button" className="saved-chip-open" onClick={() => openSearch(s)} title="Show this search below">{s.name}</button>
                  <button type="button" className="saved-chip-delete" onClick={() => { void onDelete(s); }} aria-label={`Delete saved search ${s.name}`}>×</button>
                </li>
              ))}
            </ul>
            {matches && matches.length === 0 && (
              <p className="muted saved-empty">
                Nothing new yet. Tenders first found after you saved a search appear here; the list is checked every few minutes.
              </p>
            )}
            {matches && matches.length > 0 && (
              <ul className="tb-list">
                {matches.map((m) => (
                  <TenderRow key={m.matchId} t={m.tender} busy={busy === m.tender.id} isNew={freshIds.has(m.matchId)}
                    onTrack={() => { onTrack(m.tender).catch((err) => setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not track this tender.' })); }} />
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}

      <Panel id="feed" title="Tenders" aside={
        <button type="button" className="btn-primary saved-save" disabled={!hasFilter || saving} onClick={() => { void onSave(); }}
          title={hasFilter ? 'Get the new tenders that match this search' : 'Choose a list, state, organisation or words first'}>
          {saving ? 'Saving…' : 'Save this search'}
        </button>
      }>
        {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'save-confirmation saved-message' : 'error-text saved-message'}>{message.text}</p>}
        <div className="card">
          <TenderBrowser load={load} onTrack={onTrack} />
        </div>
      </Panel>
    </>
  );
}
