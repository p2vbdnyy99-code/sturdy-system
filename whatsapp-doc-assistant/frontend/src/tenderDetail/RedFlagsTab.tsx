import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { RedFlag } from '../api/tenders';

export function RedFlagsTab({ redFlags }: { redFlags: RedFlag[] }) {
  if (redFlags.length === 0) {
    return <EmptyState title="No red flags were identified" />;
  }

  return (
    <ul className="requirement-list">
      {redFlags.map((flag) => (
        <li key={flag.id} className="requirement-card">
          <p>
            <EvidenceTooltip value={flag.description} sourcePage={flag.sourcePage} evidenceText={flag.evidenceText} />
          </p>
        </li>
      ))}
    </ul>
  );
}
