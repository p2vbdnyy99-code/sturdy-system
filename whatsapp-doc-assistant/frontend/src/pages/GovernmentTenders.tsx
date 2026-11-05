import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getFeedFacets, getLandingPages, getPublicTenders, type FeedFacets } from '../api/feed';
import { paramsFromQuery } from '../tenders/browse';
import type { LandingPage } from '../tenders/landing';
import { embeddedLanding, landingDataUsed, landingQuery } from '../tenders/landingData';
import { PageIntro, PublicLayout } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { TenderBrowser } from '../tenders/TenderBrowser';
import { SourceNote } from '../tenders/SourceNote';
import { countWording } from '../tenders/freshness';

// Public tender search (no sign-in): central, state and GeM tenders from
// CPPP's public lists, by state and by organisation. Tracking a tender, its
// checklist and the AI reading of its PDF need an account.
//
/** The search, started afresh for each path. Both routes render the same
 *  page, so without the key React kept a list page's state (its heading and
 *  filter) after a link to the main search. */
export function GovernmentTendersRoute() {
  const { pathname } = useLocation();
  return <GovernmentTendersPage key={pathname} />;
}

// /government-tenders/<group>/<slug> (state, organisation, central or GeM;
// backend/src/landingPages.js) is the same search, opened on that list. When
// the server put that list's data in the page (tenders/landingData.ts), the
// first render already shows it: nothing is fetched and nothing moves.
export function GovernmentTendersPage() {
  const { group } = useParams<{ group?: string; slug?: string }>();
  const { pathname } = useLocation();
  const [embedded] = useState(() => (group ? embeddedLanding(pathname) : null));
  // The server's data is for the page load only: once this page is shown,
  // coming back to any list later fetches it fresh.
  useEffect(() => { landingDataUsed(); }, []);

  const [facets, setFacets] = useState<FeedFacets | null>(embedded?.facets ?? null);
  useEffect(() => {
    if (embedded) return;
    getFeedFacets().then(setFacets).catch(() => setFacets(null));
  }, [embedded]);
  const open = facets ? facets.open.central + facets.open.state + facets.open.gem : null;

  const [params, setParams] = useSearchParams();
  // undefined while a landing page is being looked up; null for none.
  const [landing, setLanding] = useState<LandingPage | null | undefined>(group ? (embedded?.page ?? undefined) : null);
  const hasQuery = params.toString() !== '';
  useEffect(() => {
    if (!group) return undefined;
    const show = (page: LandingPage | null) => {
      setLanding(page);
      if (page && !hasQuery) setParams(paramsFromQuery(landingQuery(page)), { replace: true });
    };
    if (embedded?.page.path === pathname) {
      show(embedded.page);
      return undefined;
    }
    let cancelled = false;
    getLandingPages().then(({ pages }) => {
      if (!cancelled) show(pages.find((p) => p.path === pathname) ?? null);
    }).catch(() => { if (!cancelled) setLanding(null); });
    return () => { cancelled = true; };
  }, [group, pathname, hasQuery, setParams, embedded]);
  // Until the URL carries the landing filter, the list opens on it directly.
  const defaultQuery = useMemo(() => (landing ? landingQuery(landing) : undefined), [landing]);
  const initial = useMemo(() => (embedded
    ? { key: paramsFromQuery(landingQuery(embedded.page)).toString(), result: embedded.result, facets: embedded.facets }
    : undefined), [embedded]);
  const heading = landing
    ? (landing.kind === 'gem' ? 'GeM bids open now' : `${landing.label} government tenders`)
    : 'Find government tenders across India';
  // A state or organisation page counts its own list (as its server HTML
  // does), not every open tender in India.
  const count = landing ? landing.count : open;

  return (
    <PublicLayout>
      <PageIntro kicker="Government tenders" title={heading}>
        <p>Central, state and GeM tenders in one search, by state or organisation. Free, no sign-in needed.</p>
        {count !== null && count > 0 && (
          <p className="tb-intro-count"><strong>{count.toLocaleString('en-IN')}</strong> {countWording(facets?.freshness, landing?.kind ?? null)}</p>
        )}
      </PageIntro>
      <section className="home-section tb-section">
        <div className="home-container">
          <SourceNote />
          {landing !== undefined && <TenderBrowser load={getPublicTenders} defaultQuery={defaultQuery} initial={initial} />}
          <div className="tb-cta">
            <div>
              <h2>Found one worth bidding for?</h2>
              <p>
                Track it in {PRODUCT_NAME}: upload its PDF and get the deadline, EMD, eligibility, BOQ and risky clauses
                with page references, a submission checklist, and corrigendum checks.
              </p>
            </div>
            <Link to="/register" className="btn-link btn-accent btn-lg">Start free <Icon name="arrowRight" /></Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
