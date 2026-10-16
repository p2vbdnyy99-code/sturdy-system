import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getFeedFacets, getLandingPages, getPublicTenders, type FeedFacets } from '../api/feed';
import { paramsFromQuery, queryFromParams } from '../tenders/browse';
import type { LandingPage } from '../tenders/landing';
import { PageIntro, PublicLayout } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { TenderBrowser } from '../tenders/TenderBrowser';
import { SourceNote } from '../tenders/SourceNote';

// Public tender search (no sign-in): central, state and GeM tenders from
// CPPP's public lists, by state and by organisation. Tracking a tender, its
// checklist and the AI reading of its PDF need an account.
//
// /government-tenders/<group>/<slug> (state, organisation, central or GeM;
// backend/src/landingPages.js) is the same search, opened on that list.
export function GovernmentTendersPage() {
  const [facets, setFacets] = useState<FeedFacets | null>(null);
  useEffect(() => { getFeedFacets().then(setFacets).catch(() => setFacets(null)); }, []);
  const open = facets ? facets.open.central + facets.open.state + facets.open.gem : null;

  const { group } = useParams<{ group?: string; slug?: string }>();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  // undefined while a landing page is being looked up; null for none.
  const [landing, setLanding] = useState<LandingPage | null | undefined>(group ? undefined : null);
  const hasQuery = params.toString() !== '';
  useEffect(() => {
    if (!group) return undefined;
    let cancelled = false;
    getLandingPages().then(({ pages }) => {
      if (cancelled) return;
      const page = pages.find((p) => p.path === pathname) ?? null;
      setLanding(page);
      if (page && !hasQuery) {
        const q = queryFromParams(new URLSearchParams());
        setParams(paramsFromQuery({ ...q, kind: page.kind, state: page.state, organisation: page.organisation }), { replace: true });
      }
    }).catch(() => { if (!cancelled) setLanding(null); });
    return () => { cancelled = true; };
  }, [group, pathname, hasQuery, setParams]);
  const heading = landing
    ? (landing.kind === 'gem' ? 'GeM bids open now' : `${landing.label} government tenders`)
    : 'Find government tenders across India';

  return (
    <PublicLayout>
      <PageIntro kicker="Government tenders" title={heading}>
        <p>Central, state and GeM tenders in one search, by state or organisation. Free, no sign-in needed.</p>
        {open !== null && open > 0 && (
          <p className="tb-intro-count"><strong>{open.toLocaleString('en-IN')}</strong> open tenders right now</p>
        )}
      </PageIntro>
      <section className="home-section tb-section">
        <div className="home-container">
          <SourceNote />
          {landing !== undefined && <TenderBrowser load={getPublicTenders} />}
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
