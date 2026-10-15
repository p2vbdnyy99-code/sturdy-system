import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFeedFacets, getPublicTenders, type FeedFacets } from '../api/feed';
import { PageIntro, PublicLayout } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { TenderBrowser } from '../tenders/TenderBrowser';
import { SourceNote } from '../tenders/SourceNote';

// Public tender search (no sign-in): central, state and GeM tenders from
// CPPP's public lists, by state and by organisation. Tracking a tender, its
// checklist and the AI reading of its PDF need an account.
export function GovernmentTendersPage() {
  const [facets, setFacets] = useState<FeedFacets | null>(null);
  useEffect(() => { getFeedFacets().then(setFacets).catch(() => setFacets(null)); }, []);
  const open = facets ? facets.open.central + facets.open.state + facets.open.gem : null;

  return (
    <PublicLayout>
      <PageIntro kicker="Government tenders" title="Find government tenders across India">
        <p>Central, state and GeM tenders in one search, by state or organisation. Free, no sign-in needed.</p>
        {open !== null && open > 0 && (
          <p className="tb-intro-count"><strong>{open.toLocaleString('en-IN')}</strong> open tenders right now</p>
        )}
      </PageIntro>
      <section className="home-section tb-section">
        <div className="home-container">
          <SourceNote />
          <TenderBrowser load={getPublicTenders} />
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
