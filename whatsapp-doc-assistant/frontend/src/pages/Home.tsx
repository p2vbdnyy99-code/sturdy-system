import { useEffect, useState } from 'react';
import { LANDING_MIN_OPEN, statePath } from '../tenders/landing';
import { getFeedFacets, type FeedFacets } from '../api/feed';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { PublicLayout } from '../components/PublicLayout';
import { Icon, type IconName } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS } from '../config/site';

// Public homepage at "/". Signed-in users keep the old behaviour of "/"
// (straight to the dashboard). Copy describes only what the product does
// today: no customer logos, testimonials or usage numbers.
const FEATURES: Array<{ icon: IconName; title: string; body: string; to: string }> = [
  { icon: 'globe', title: 'Find government tenders', body: 'Central, state-wise and GeM tenders in one search, by state or organisation. Free, no sign-in.', to: '/government-tenders' },
  { icon: 'calendar', title: 'Key facts at a glance', body: 'Submission deadline, EMD, tender fee, estimated value and contract period, pulled to the top.', to: '/features#read' },
  { icon: 'briefcase', title: 'Check against your company', body: 'Save your company profile once and see which conditions you appear to meet, and which you don’t.', to: '/features#eligibility' },
  { icon: 'flag', title: 'Bid tracker', body: 'Every tender from first look to result: stages, your internal deadline, notes and the portal ID.', to: '/features#tracker' },
  { icon: 'check', title: 'Submission checklist', body: 'The documents and proofs the tender asks for, with page numbers. Tick them off; download as Excel.', to: '/features#checklist' },
  { icon: 'history', title: 'Corrigendum check', body: 'Upload an amendment and see what changed in the deadline, EMD or dates, quoted with its page.', to: '/features#corrigendum' },
  { icon: 'users', title: 'Client workspaces', body: 'For consultants: a profile per client, and each tender checked against the right one.', to: '/features#clients' },
  { icon: 'search', title: 'Every answer has a source', body: 'Each point shows the page it came from, with the quoted text, so you can verify in seconds.', to: '/features#read' },
];

const STEPS = [
  { title: 'Upload the tender PDF', body: 'A tender document from CPPP, GeM or a state e-procurement portal. Typed PDFs work best; scanned pages are read too.' },
  { title: `${PRODUCT_NAME} reads every page`, body: 'The whole document is analysed section by section, usually in a few minutes.' },
  { title: 'Decide whether to bid', body: 'Review the key facts, eligibility and risks, then open the source page for anything you want to confirm.' },
];

export function HomePage() {
  const { status } = useSession();
  const { hash } = useLocation();
  // Footer links like /#how-it-works arrive from other pages; the browser
  // doesn't scroll to the anchor after a client-side navigation, so do it.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <PublicLayout>
      <section className="home-hero">
        <div className="home-container home-hero-inner">
          <div className="home-hero-copy">
            <span className="home-eyebrow">Early access &middot; first {FREE_TRIAL_TENDERS} tenders free</span>
            <h1>Understand a 150-page tender in minutes, not days</h1>
            <p className="home-hero-lead">
              Upload a government tender PDF. {PRODUCT_NAME} pulls out the deadline, EMD, eligibility
              conditions, BOQ and risky clauses, each linked to the page it came from.
            </p>
            <div className="home-hero-actions">
              <Link to="/register" className="btn-link btn-accent btn-lg">
                Start your free trial <Icon name="arrowRight" />
              </Link>
              <Link to="/government-tenders" className="btn-link btn-ghost-light btn-lg">Find tenders</Link>
            </div>
            <p className="home-hero-note">Your first {FREE_TRIAL_TENDERS} tenders are free. No card needed. Works on your phone.</p>
          </div>
          <HeroPreview />
        </div>
      </section>

      <TenderBand />

      <section className="home-section" id="features">
        <div className="home-container">
          <p className="home-kicker">What you get</p>
          <h2 className="home-heading">From finding a tender to submitting the bid</h2>
          <div className="home-features">
            {FEATURES.map((f) => (
              <Link key={f.title} to={f.to} className="home-feature home-feature-link">
                <span className="home-feature-icon"><Icon name={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Link>
            ))}
          </div>
          <p className="home-features-more"><Link to="/features" className="home-teaser-link">See every feature <Icon name="arrowRight" /></Link></p>
        </div>
      </section>

      <section className="home-section home-section-alt" id="how-it-works">
        <div className="home-container">
          <p className="home-kicker">How it works</p>
          <h2 className="home-heading">Three steps from PDF to a bid decision</h2>
          <ol className="home-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="home-step">
                <span className="home-step-number">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section">
        <div className="home-container home-trust">
          <div>
            <p className="home-kicker">Built to be checked</p>
            <h2 className="home-heading">AI that shows its work</h2>
            <p className="home-trust-lead">
              Tender mistakes are expensive, so {PRODUCT_NAME} never asks you to take its word for it.
            </p>
          </div>
          <ul className="home-trust-list">
            <li><Icon name="search" /><span><strong>Page references on every point.</strong> Tap the page number to see the exact text.</span></li>
            <li><Icon name="info" /><span><strong>Honest about gaps.</strong> If something couldn&rsquo;t be found or read, it says so instead of guessing.</span></li>
            <li><Icon name="shield" /><span><strong>Your tenders stay private.</strong> Each company&rsquo;s documents are visible only to its own members.</span></li>
          </ul>
        </div>
      </section>

      <section className="home-section home-section-alt">
        <div className="home-container home-teasers">
          <Link to="/pricing" className="home-teaser">
            <p className="home-kicker">Pricing</p>
            <h3>Your first {FREE_TRIAL_TENDERS} tenders free</h3>
            <p>Every feature in the free trial, no card needed. Monthly plans after that.</p>
            <span className="home-teaser-link">See pricing <Icon name="arrowRight" /></span>
          </Link>
          <Link to="/faq" className="home-teaser">
            <p className="home-kicker">FAQ</p>
            <h3>What happens to my documents?</h3>
            <p>Plus scanned PDFs, Hindi tenders, accuracy and more, answered plainly.</p>
            <span className="home-teaser-link">Read the FAQ <Icon name="arrowRight" /></span>
          </Link>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <h2>Try it on the next tender you&rsquo;re considering</h2>
          <Link to="/register" className="btn-link btn-accent btn-lg">Start your free trial <Icon name="arrowRight" /></Link>
        </div>
      </section>

    </PublicLayout>
  );
}

// Live counts from the public tender search, with shortcuts into it. Shows
// nothing until the counts arrive (and nothing if there are none yet).
function TenderBand() {
  const [facets, setFacets] = useState<FeedFacets | null>(null);
  useEffect(() => { getFeedFacets().then(setFacets).catch(() => setFacets(null)); }, []);
  const total = facets ? facets.open.central + facets.open.state + facets.open.gem : 0;
  const topStates = facets ? [...facets.states].sort((a, b) => b.count - a.count).slice(0, 8) : [];
  return (
    <section className="home-section home-section-alt home-tenders" aria-labelledby="home-tenders-title">
      <div className="home-container">
        <p className="home-kicker">Find tenders</p>
        <h2 className="home-heading" id="home-tenders-title">Government tenders across India, in one search</h2>
        <p className="home-tenders-lead">
          Central ministries and PSUs, state e-procurement portals and GeM bids, from the Central Public Procurement
          Portal. Search by state, organisation or work, free and without signing in.
        </p>
        <div className="home-tender-kinds">
          <Link to="/government-tenders?kind=central" className="home-tender-kind">
            <span>Central government</span>
            <strong>{facets ? facets.open.central.toLocaleString('en-IN') : '—'}</strong><small>open</small>
          </Link>
          <Link to="/government-tenders?kind=state" className="home-tender-kind">
            <span>State portals</span>
            <strong>{facets ? facets.open.state.toLocaleString('en-IN') : '—'}</strong><small>open</small>
          </Link>
          <Link to="/government-tenders?kind=gem" className="home-tender-kind">
            <span>GeM bids</span>
            <strong>{facets ? facets.open.gem.toLocaleString('en-IN') : '—'}</strong><small>open</small>
          </Link>
        </div>
        {topStates.length > 0 && (
          <div className="home-tender-states" aria-label="Browse by state">
            {topStates.map((s) => (
              <Link key={s.name} to={s.count >= LANDING_MIN_OPEN ? statePath(s.name) : `/government-tenders?kind=state&state=${encodeURIComponent(s.name)}`} className="chip-link">{s.name}</Link>
            ))}
          </div>
        )}
        <Link to="/government-tenders" className="btn-link btn-primary">
          {total > 0 ? `Search ${total.toLocaleString('en-IN')} open tenders` : 'Search tenders'} <Icon name="arrowRight" />
        </Link>
      </div>
    </section>
  );
}

// Illustration of the tender page, built in HTML/CSS (no screenshot file).
// Clearly labelled as an example; the values are made up.
function HeroPreview() {
  return (
    <div className="home-preview" aria-label="Example of an analysed tender">
      <div className="home-preview-bar">
        <span /><span /><span />
        <em>Example</em>
      </div>
      <div className="home-preview-body">
        <p className="home-preview-title">Construction of boundary wall and approach road</p>
        <p className="home-preview-org">Public Works Division &middot; 86 pages</p>
        <div className="home-preview-facts">
          <div className="home-preview-fact home-preview-fact-due">
            <span>Deadline</span><strong>18 Oct 2026</strong><small>p.3</small>
          </div>
          <div className="home-preview-fact"><span>EMD</span><strong>&#8377;1,27,300</strong><small>p.4</small></div>
          <div className="home-preview-fact"><span>Estimated value</span><strong>&#8377;63.6 lakh</strong><small>p.2</small></div>
        </div>
        <ul className="home-preview-list">
          <li><Icon name="check" /><span>Average turnover &ge; 30% of estimated cost</span><small>p.11</small></li>
          <li><Icon name="check" /><span>3 similar works in the last 7 years</span><small>p.11</small></li>
          <li className="home-preview-flag"><Icon name="alert" /><span>Penalty 0.5% per week of delay, up to 10%</span><small>p.27</small></li>
        </ul>
      </div>
    </div>
  );
}
