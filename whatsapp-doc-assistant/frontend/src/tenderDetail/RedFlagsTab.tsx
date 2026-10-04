import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import type { RedFlag } from '../api/tenders';

export function RedFlagsTab({ redFlags }: { redFlags: RedFlag[] }) {
  if (redFlags.length === 0) {
    return <EmptyState title="No red flags were identified" />;
  }

  return (
    <>
      <p className="tab-intro">
        {redFlags.length} {redFlags.length === 1 ? 'clause' : 'clauses'} worth reading closely before you bid.
      </p>
      <ul className="flag-list">
        {redFlags.map((flag) => (
          <li key={flag.id} className="flag-card">
            <Icon name="alert" className="flag-card-icon" />
            <p>
              <EvidenceTooltip value={flag.description} sourcePage={flag.sourcePage} evidenceText={flag.evidenceText} />
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
