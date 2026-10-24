import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageIntro, PublicLayout } from '../../components/PublicLayout';
import { Icon } from '../../components/Icon';
import { FREE_TRIAL_TENDERS } from '../../config/site';
import { GUIDES, checkedLabel, guidePath } from '../../guides/guides';

export type Source = { name: string; url: string; note: string };

// One guide: the direct answer first, the sections, the sources it quotes,
// and links to the other guides. Written to be checked: every rule it states
// is quoted from a source listed at the end.
export function GuideLayout({ slug, answer, children, sources }: {
  slug: string;
  answer: ReactNode;
  children: ReactNode;
  sources: Source[];
}) {
  const guide = GUIDES.find((g) => g.slug === slug)!;
  const others = GUIDES.filter((g) => g.slug !== slug);
  return (
    <PublicLayout>
      <PageIntro kicker="Guide" title={guide.title}>
        <p className="guide-byline">
          <Link to="/guides">TenderTez guides</Link> &middot; Sources checked {checkedLabel()}
        </p>
      </PageIntro>

      <section className="home-section legal-section">
        <div className="home-container legal-container guide">
          <div className="guide-answer">{answer}</div>
          {children}

          <section className="legal-block guide-cta">
            <h2>Check a tender in minutes</h2>
            <p>
              TenderTez lists every condition, document, date and EMD in a tender PDF with the page it is on and the
              quoted text, and checks eligibility against your company profile. Your first {FREE_TRIAL_TENDERS} tenders
              are free.
            </p>
            <p className="guide-cta-links">
              <Link to="/register" className="btn-link btn-accent">Analyse a tender free <Icon name="arrowRight" /></Link>
              <Link to="/sample-analysis">See a real analysis of an AIIMS tender</Link>
            </p>
          </section>

          <section className="legal-block guide-sources">
            <h2>Sources</h2>
            <p>Read in full on {checkedLabel()}. Where a rule differs, the tender in front of you decides.</p>
            <ul>
              {sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>: {s.note}
                </li>
              ))}
            </ul>
          </section>

          <section className="legal-block">
            <h2>More guides</h2>
            <ul>
              {others.map((g) => <li key={g.slug}><Link to={guidePath(g.slug)}>{g.title}</Link></li>)}
            </ul>
          </section>
        </div>
      </section>
    </PublicLayout>
  );
}

/** A question and its answer in a guide's FAQ. Plain headings, so the text is
 *  readable before the app loads and by readers that don't open <details>. */
export function GuideQuestion({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="guide-question">
      <h3>{q}</h3>
      <p>{children}</p>
    </div>
  );
}
