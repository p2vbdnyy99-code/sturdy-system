import type { Requirement } from '../api/tenders';
import { Icon } from '../components/Icon';
import { deadlineSummary } from './deadlineSummary';

// The tender page's dark card: time left to submit and the eligibility
// counts, both straight from the analysis. It gives no bid/no-bid verdict.
export function DeadlineCard({ deadline, requirements, eligibilityChecked, onOpenRequirements }: {
  deadline: string | null;
  requirements: Requirement[];
  eligibilityChecked: boolean;
  onOpenRequirements: () => void;
}) {
  const s = deadlineSummary(deadline, requirements, eligibilityChecked);
  return (
    <section className="feature-card" aria-labelledby="deadline-card-heading">
      <p className="feature-pill"><Icon name="file" />From the tender document</p>
      <h2 id="deadline-card-heading" className="visually-hidden">Deadline and eligibility</h2>
      <p className="feature-figure">
        <span className="feature-figure-value">{s.figure}</span>
        {s.unit && <span className="feature-figure-unit">{s.unit}</span>}
      </p>
      <p className="feature-byline">{s.byLine}</p>
      <p className="feature-headline">{s.headline}</p>
      {s.eligibility && (
        <ul className="feature-counts">
          <li><strong>{s.eligibility.met}</strong> appear met</li>
          <li><strong>{s.eligibility.notMet}</strong> don&rsquo;t appear met</li>
          <li><strong>{s.eligibility.unknown}</strong> unclear</li>
        </ul>
      )}
      {requirements.length > 0 && (
        <button type="button" className="btn-pill" onClick={onOpenRequirements}>
          <Icon name="list" />See the requirements
        </button>
      )}
      <p className="feature-foot">Check the original document before you bid.</p>
    </section>
  );
}
