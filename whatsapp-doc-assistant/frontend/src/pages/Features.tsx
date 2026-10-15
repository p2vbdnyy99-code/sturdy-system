import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PageIntro, PublicLayout } from '../components/PublicLayout';
import { Icon, type IconName } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS } from '../config/site';

// Everything the product does today, for visitors who haven't signed up.
// Describe only what exists; no verdicts, customers or numbers we can't show.
const FEATURE_GROUPS: Array<{ id: string; icon: IconName; title: string; lead: string; points: string[]; link?: { to: string; label: string } }> = [
  {
    id: 'find',
    icon: 'globe',
    title: 'Find government tenders',
    lead: 'Central ministries and PSUs, state e-procurement portals and GeM bids, searchable in one place, free and without signing in.',
    points: [
      'Browse state-wise: open tenders for each state, with counts',
      'Browse by organisation: railways, defence, PSUs, departments',
      'GeM bids with their department and bid number',
      'Filter by open, closing within 7 days or closed; sort by newest or closing soonest',
      'Copy the tender ID and open the right portal\'s search in one click',
    ],
    link: { to: '/government-tenders', label: 'Search tenders now' },
  },
  {
    id: 'read',
    icon: 'file',
    title: 'Read a 150-page tender in minutes',
    lead: `Upload the tender PDF and ${PRODUCT_NAME} reads every page.`,
    points: [
      'Deadline, EMD, tender fee, estimated value and contract period at the top',
      'Eligibility conditions, required documents, BOQ items and risky clauses',
      'Every point links to the page it came from, with the quoted text',
      'Scanned pages are read too',
    ],
  },
  {
    id: 'eligibility',
    icon: 'briefcase',
    title: 'Check eligibility against your company',
    lead: 'Save your company profile once and see which conditions you appear to meet and which you don\'t, each with the reason.',
    points: ['Turnover, experience, certificates, licences and more', 'Answers "None" where something doesn\'t apply, so nothing is invented'],
  },
  {
    id: 'tracker',
    icon: 'flag',
    title: 'Bid tracker',
    lead: 'Keep every tender you\'re working on in one list, from first look to result.',
    points: [
      'Stages: New, Reviewing, Interested, Preparing bid, Submitted, Won, Not won, Dropped',
      'Your own internal deadline, notes, and the portal\'s tender ID and link',
      'Filter the dashboard by stage; deadlines counted down in the sidebar',
    ],
  },
  {
    id: 'checklist',
    icon: 'check',
    title: 'Submission checklist',
    lead: 'A checklist of the documents and proofs the tender asks for, built from the tender itself, with page numbers.',
    points: ['Tick items as they\'re ready; add your own', 'Download it as an Excel sheet to share with your team'],
  },
  {
    id: 'corrigendum',
    icon: 'history',
    title: 'Corrigendum check',
    lead: 'Upload an amendment and see what changed: deadline, EMD, value, dates, each quoted from the corrigendum with its page.',
    points: ['Apply the changes you accept to the tender in one click', 'A record of what changed and when'],
  },
  {
    id: 'clients',
    icon: 'users',
    title: 'Client workspaces for consultants',
    lead: 'Bid for several firms? Keep a profile for each client and check every tender against the right one.',
    points: ['Mark a tender for a client; filter the dashboard by client', 'All clients share your one plan'],
  },
];

export function FeaturesPage() {
  const { hash } = useLocation();
  // Links like /features#tracker arrive by client-side navigation, which
  // doesn't scroll to the anchor by itself.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <PublicLayout>
      <PageIntro kicker="Features" title="From finding a tender to submitting the bid">
        <p>Everything {PRODUCT_NAME} does today. Your first {FREE_TRIAL_TENDERS} tenders are free, with every feature.</p>
      </PageIntro>
      <section className="home-section">
        <div className="home-container feature-groups">
          {FEATURE_GROUPS.map((g) => (
            <article key={g.id} id={g.id} className="feature-group">
              <span className="home-feature-icon"><Icon name={g.icon} /></span>
              <div>
                <h2>{g.title}</h2>
                <p className="feature-lead">{g.lead}</p>
                <ul className="feature-points">
                  {g.points.map((p) => <li key={p}><Icon name="check" /><span>{p}</span></li>)}
                </ul>
                {g.link && <Link to={g.link.to} className="home-teaser-link">{g.link.label} <Icon name="arrowRight" /></Link>}
              </div>
            </article>
          ))}
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
