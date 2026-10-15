import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFeed, trackFeedTender, type FeedQuery, type FeedTender } from '../api/feed';
import { useSession } from '../auth/SessionProvider';
import { Breadcrumb, Panel } from '../components/AppShell';
import { useShellData } from '../shell/ShellData';
import { TenderBrowser } from '../tenders/TenderBrowser';
import { SourceNote } from '../tenders/SourceNote';

// The tender feed inside the app: the same search as the public
// /government-tenders page, plus Track, which adds a tender to your tenders
// (you attach its PDF from the portal before it can be analysed).
export function FeedPage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string;
  const navigate = useNavigate();
  const shell = useShellData();
  const load = useCallback((q: FeedQuery) => getFeed(q), []);

  async function onTrack(t: FeedTender) {
    const r = await trackFeedTender(t.id, companyId);
    shell.reload();
    navigate(`/tenders/${r.tenderId}`);
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
      <Panel id="feed" title="Tenders">
        <div className="card">
          <TenderBrowser load={load} onTrack={onTrack} />
        </div>
      </Panel>
    </>
  );
}
