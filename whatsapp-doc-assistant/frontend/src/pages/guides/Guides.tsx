import { Link } from 'react-router-dom';
import { PageIntro, PublicLayout } from '../../components/PublicLayout';
import { Icon } from '../../components/Icon';
import { GUIDES, checkedLabel, guidePath } from '../../guides/guides';

export function GuidesPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="Guides" title="Guides to reading Indian government tenders">
        <p>
          Short, sourced answers to the questions that decide whether a bid is accepted: eligibility, EMD and
          corrigenda. Each guide quotes the rule or tender it relies on and links to it. Sources checked{' '}
          {checkedLabel()}.
        </p>
      </PageIntro>

      <section className="home-section">
        <div className="home-container home-teasers">
          {GUIDES.map((g) => (
            <Link key={g.slug} to={guidePath(g.slug)} className="home-teaser">
              <p className="home-kicker">Guide</p>
              <h2 className="guide-teaser-title">{g.title}</h2>
              <p>{g.summary}</p>
              <span className="home-teaser-link">Read the guide <Icon name="arrowRight" /></span>
            </Link>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
