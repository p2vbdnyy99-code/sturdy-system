import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { Icon, type IconName } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL, FOUNDER } from '../config/site';

// Company voice until the founder's own note is added in config/site.ts;
// nothing here is invented (no team, no customer names, no numbers).
const PRINCIPLES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'search', title: 'Show the source', body: 'Every point links to the page and the exact text it came from. You should never have to trust a summary blindly.' },
  { icon: 'info', title: 'Say when unsure', body: 'If a detail isn’t in the document, or part of the file couldn’t be read, the page says so plainly.' },
  { icon: 'shield', title: 'Keep tenders private', body: 'Your company’s documents are visible only to your company’s account. They are never sold, and are sent only to our AI provider to be analysed.' },
];

export function AboutPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="About" title={`Why ${PRODUCT_NAME} exists`}>
        <p>
          A government tender is often 50 to 200 pages. The deadline is on one page, the EMD on another, and
          the eligibility conditions are spread across sections, annexures and corrigenda.
        </p>
      </PageIntro>

      <section className="home-section about-section">
        <div className={`home-container${FOUNDER ? ' about-grid' : ''}`}>
          <div className="about-story">
            <h2>Reading tenders shouldn&rsquo;t take days</h2>
            <p>
              Small and mid-sized contractors usually read these documents themselves, between running sites and
              chasing payments. Miss one condition, such as a turnover limit, a missing certificate or an EMD
              format, and a bid can be rejected on technical grounds before anyone looks at the price.
            </p>
            <p>
              {PRODUCT_NAME} reads the whole document and lays out what you need to decide: the key dates and
              money, what you must prove to be eligible, what to quote for, and the clauses that could hurt you
              later. You still make the call. It just gets you to it faster, with the page reference for every
              point.
            </p>
            <p>
              We&rsquo;re built in India, for Indian public procurement, and we&rsquo;re in early access. The
              contractors using it now are shaping what comes next.
            </p>
          </div>

          {FOUNDER && (
            <aside className="about-founder">
              <p className="home-kicker">From the founder</p>
              {FOUNDER.story.map((para) => <p key={para}>{para}</p>)}
              <p className="about-founder-sign">{FOUNDER.name}, {FOUNDER.city}</p>
            </aside>
          )}
        </div>
      </section>

      <section className="home-section home-section-alt">
        <div className="home-container">
          <p className="home-kicker">How we work</p>
          <h2 className="home-heading">Three rules we don&rsquo;t bend</h2>
          <div className="home-steps">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="home-step">
                <span className="home-feature-icon"><Icon name={p.icon} /></span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <h2>
            {CONTACT_EMAIL
              ? <>Questions, or a tender you&rsquo;d like us to try? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></>
              : <>See what it makes of a tender you&rsquo;re considering</>}
          </h2>
          <Link to="/register" className="btn-link btn-accent btn-lg">Start your free trial <Icon name="arrowRight" /></Link>
        </div>
      </section>
    </PublicLayout>
  );
}
