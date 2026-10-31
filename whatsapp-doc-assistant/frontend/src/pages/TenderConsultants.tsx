import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { Icon, type IconName } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS, PLANS } from '../config/site';
import { FREE_TENDERS_WITHOUT_PROFILE } from '../shell/profileGate';

// /tender-consultants: what TenderTez does for consultants who bid for
// several client firms. Every feature named here exists today (copy from
// marketing/seo/pages/P3-tender-consultants.md, re-checked against the code
// on 28 Oct 2026). There is no bid/no-bid verdict: never promise one.
// The FAQ below also becomes this page's FAQPage JSON-LD (backend seo.js
// reads it from the server-rendered HTML), so change it here only.

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'users',
    title: 'A workspace per client',
    body: 'Add each firm under Clients with its own profile. Choose on a tender who it is for, and the eligibility check uses that firm’s details.',
  },
  {
    icon: 'search',
    title: 'Every condition with its page',
    body: 'Deadline, EMD, fees, eligibility, required documents, BOQ items, key dates and risky clauses, each with the page number and quoted text, so you can show a client exactly where a requirement is.',
  },
  {
    icon: 'check',
    title: 'A checklist to send the client',
    body: 'Built only from the tender’s own requirements, with pages. Tick off documents as they arrive, then download the list as Excel and send it to the client.',
  },
  {
    icon: 'history',
    title: 'Corrigendum check',
    body: 'Upload the corrigendum on the tender to see what changed in the deadline, EMD, eligibility or scope, quoted with its page.',
  },
  {
    icon: 'file',
    title: 'Annexure drafts',
    body: 'The tender’s own forms (undertakings, declarations, bidder details) filled from the client’s profile as Word files. Anything the profile doesn’t hold is marked “[to fill]”. Price bids and BOQs are never drafted.',
  },
  {
    icon: 'briefcase',
    title: 'Bid tracker',
    body: 'Stage, internal deadline and notes per tender, plus EMD and bank-guarantee records, with guarantees that expire within 30 days shown on the dashboard.',
  },
];

const STEPS = [
  { title: 'Get the tender', body: 'A client sends a tender, or you find one in the free tender search (central, state and GeM tenders from CPPP’s public lists).' },
  { title: 'Upload and choose the client', body: 'Upload the PDF and choose who it is for. The analysis usually takes a few minutes.' },
  { title: 'Review eligibility', body: 'See which conditions the client meets, which it appears not to meet, and which couldn’t be checked, each with the reason.' },
  { title: 'Send the checklist', body: 'Send the client the Excel checklist of documents to collect.' },
  { title: 'Check corrigenda', body: 'Upload any corrigendum and update the checklist.' },
  { title: 'Draft and bid', body: 'Draft the annexures, check them, and prepare the bid as usual. Filing and prices stay with you.' },
];

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Can I manage several client firms in one account?',
    a: <>Yes. Add each firm under Clients, fill in its profile, and choose the client on each tender. All clients share your plan.</>,
  },
  {
    q: 'Do my clients need their own logins?',
    a: <>No. The client workspaces sit inside your account.</>,
  },
  {
    q: 'Can one client see another client’s tenders?',
    a: <>Clients don&rsquo;t log in to your workspaces. Separately, one company account can never see another company&rsquo;s tenders.</>,
  },
  {
    q: 'How long does an analysis take?',
    a: <>Usually a few minutes; very large documents take longer. You can leave the page while it runs.</>,
  },
  {
    q: 'Can I send the checklist to a client?',
    a: <>Yes. Download it as an Excel sheet; each line comes from the tender&rsquo;s own requirements, with its page.</>,
  },
  {
    q: 'Does it draft the client’s annexures?',
    a: <>It drafts the tender&rsquo;s own forms as Word files using that client&rsquo;s profile. Anything missing is marked &ldquo;[to fill]&rdquo; for you to complete. Price bids and BOQs are never drafted.</>,
  },
  {
    q: 'Do I have to fill in every client’s full profile first?',
    a: <>Your own company profile is optional for your first {FREE_TENDERS_WITHOUT_PROFILE} tenders. The eligibility check on a client&rsquo;s tender uses that client&rsquo;s profile, so fill it in before you check their tenders. Fields that don&rsquo;t apply can be answered &ldquo;None&rdquo;.</>,
  },
  {
    q: 'What does it cost if I handle 20 tenders a month?',
    a: <>The {PLANS[2].name} plan covers {PLANS[2].tendersPerMonth} tenders a month for {rupees(PLANS[2].pricePerMonth)}; {PLANS[1].name} covers {PLANS[1].tendersPerMonth} for {rupees(PLANS[1].pricePerMonth)}.</>,
  },
  {
    q: 'Can I try it on a client’s live tender?',
    a: <>Yes. Your first {FREE_TRIAL_TENDERS} tenders are free with every feature included.</>,
  },
];

export function TenderConsultantsPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="For tender consultants" title="Tender analysis software for tender consultants">
        <p>
          {PRODUCT_NAME} helps tender consultants check each tender against the right client in minutes. You keep a
          profile per client firm; each tender PDF is read and its eligibility conditions are checked against that
          client&rsquo;s turnover, experience and registrations; and each point carries the page it came from.
        </p>
        <p>
          All your clients share one plan, from {rupees(PLANS[0].pricePerMonth)} a month for {PLANS[0].tendersPerMonth} tenders,
          after {FREE_TRIAL_TENDERS} free tenders.
        </p>
        <p>
          See a real analysis first: the <Link to="/sample-analysis">sample analysis of a public AIIMS tender</Link>,
          or find tenders in the <Link to="/government-tenders">free tender search</Link>.
        </p>
      </PageIntro>

      <section className="home-section">
        <div className="home-container">
          <h2 className="home-heading">What does a consultant get?</h2>
          <div className="feature-groups">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature-group">
                <span className="home-feature-icon"><Icon name={f.icon} /></span>
                <div>
                  <h3>{f.title}</h3>
                  <p className="feature-lead">{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-section-alt">
        <div className="home-container">
          <h2 className="home-heading">How does it fit a consultant&rsquo;s week?</h2>
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
        <div className="home-container">
          <h2 className="home-heading">What it does not do</h2>
          <ul className="feature-points">
            <li><Icon name="info" /><span>It gives no bid/no-bid verdict. You and your client decide.</span></li>
            <li><Icon name="info" /><span>It never files a bid or fills in prices.</span></li>
            <li><Icon name="info" /><span>Its tender search covers CPPP&rsquo;s public lists, which is not every tender in India.</span></li>
          </ul>
        </div>
      </section>

      <section className="home-section home-section-alt">
        <div className="home-container">
          <h2 className="home-heading">Pricing for consultants</h2>
          <p>All your clients share one plan. A tender counts once, whichever client it is for.</p>
          <ul className="feature-points">
            <li><Icon name="check" /><span>Free trial: your first {FREE_TRIAL_TENDERS} tenders, every feature, no card</span></li>
            {PLANS.map((p) => (
              <li key={p.name}><Icon name="check" /><span>{p.name}: {rupees(p.pricePerMonth)} a month for {p.tendersPerMonth} tenders</span></li>
            ))}
          </ul>
          <p>
            Unused tenders don&rsquo;t carry over. Nothing is charged automatically; you subscribe by email.{' '}
            <Link to="/pricing">Pricing details</Link>
          </p>
        </div>
      </section>

      <section className="home-section faq-section">
        <div className="home-container faq-container">
          <div className="faq-group">
            <h2>Frequently asked questions</h2>
            {FAQ.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>{item.q}</summary>
                <div className="faq-answer">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <h2>Try it on a client&rsquo;s tender</h2>
          <Link to="/register" className="btn-link btn-accent btn-lg">Start your free trial <Icon name="arrowRight" /></Link>
        </div>
      </section>
    </PublicLayout>
  );
}
