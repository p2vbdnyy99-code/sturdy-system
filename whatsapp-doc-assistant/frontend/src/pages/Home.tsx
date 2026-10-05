import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { Logo } from '../components/Logo';
import { Icon, type IconName } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';

// Public homepage at "/". Signed-in users keep the old behaviour of "/"
// (straight to the dashboard). Copy describes only what the product does
// today: no customer logos, testimonials or usage numbers.
const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'calendar', title: 'Key facts at a glance', body: 'Submission deadline, EMD, tender fee, estimated value and contract period, pulled to the top.' },
  { icon: 'list', title: 'Eligibility checklist', body: 'Turnover, experience, licences and documents the tender asks for, grouped so nothing is missed.' },
  { icon: 'briefcase', title: 'Check against your company', body: 'Save your company profile once and see which conditions you appear to meet, and which you don’t.' },
  { icon: 'flag', title: 'Risky clauses flagged', body: 'Penalties, payment terms and rejection conditions worth reading closely before you commit.' },
  { icon: 'layers', title: 'BOQ extracted', body: 'Bill of quantities items with quantity and unit, ready to price.' },
  { icon: 'search', title: 'Every answer has a source', body: 'Each point shows the page it came from, with the quoted text, so you can verify in seconds.' },
];

const STEPS = [
  { title: 'Upload the tender PDF', body: 'Any tender document from CPPP, GeM or a state e-procurement portal. Scanned pages are read too.' },
  { title: `${PRODUCT_NAME} reads every page`, body: 'The whole document is analysed section by section, usually in a few minutes.' },
  { title: 'Decide whether to bid', body: 'Review the key facts, eligibility and risks, then open the source page for anything you want to confirm.' },
];

export function HomePage() {
  const { status } = useSession();
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-container home-nav-inner">
          <Link to="/" className="home-nav-brand" aria-label={`${PRODUCT_NAME} home`}><Logo /></Link>
          <nav className="home-nav-links" aria-label="Main">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link to="/login" className="home-nav-login">Log in</Link>
            <Link to="/register" className="btn-link btn-primary">Start free</Link>
          </nav>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-container home-hero-inner">
          <div className="home-hero-copy">
            <span className="home-eyebrow">Free during the beta</span>
            <h1>Understand a 150-page tender in minutes, not days</h1>
            <p className="home-hero-lead">
              Upload a government tender PDF. {PRODUCT_NAME} pulls out the deadline, EMD, eligibility
              conditions, BOQ and risky clauses, each linked to the page it came from.
            </p>
            <div className="home-hero-actions">
              <Link to="/register" className="btn-link btn-accent btn-lg">
                Analyse your first tender <Icon name="arrowRight" />
              </Link>
              <Link to="/login" className="btn-link btn-ghost-light btn-lg">Log in</Link>
            </div>
            <p className="home-hero-note">No credit card. Works on your phone.</p>
          </div>
          <HeroPreview />
        </div>
      </section>

      <section className="home-section" id="features">
        <div className="home-container">
          <p className="home-kicker">What you get</p>
          <h2 className="home-heading">Everything you check before bidding, in one place</h2>
          <div className="home-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="home-feature">
                <span className="home-feature-icon"><Icon name={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
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

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <h2>Try it on the next tender you&rsquo;re considering</h2>
          <Link to="/register" className="btn-link btn-accent btn-lg">Create a free account <Icon name="arrowRight" /></Link>
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-container home-footer-inner">
          <Logo size={24} />
          <p>AI can make mistakes. Always confirm important details on the source page before you bid.</p>
          <p>&copy; {new Date().getFullYear()} {PRODUCT_NAME}</p>
        </div>
      </footer>
    </div>
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
