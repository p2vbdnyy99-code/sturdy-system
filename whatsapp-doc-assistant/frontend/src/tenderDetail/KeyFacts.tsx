import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { Icon, type IconName } from '../components/Icon';
import type { OverviewField, TenderDetail } from '../api/tenders';
import { daysUntil, formatDate, relativeDays } from '../format';

// The facts a contractor checks first, lifted out of the Overview list into
// the Key facts card. Same overview data and evidence chips; a missing value
// says so plainly rather than leaving a gap.
type FactKey = 'submissionDeadline' | 'emd' | 'estimatedValue' | 'tenderFee' | 'contractDuration' | 'openingDate';
const FACTS: Array<{ key: FactKey; label: string; icon: IconName; isDate?: boolean }> = [
  { key: 'submissionDeadline', label: 'Submission deadline', icon: 'calendar', isDate: true },
  { key: 'emd', label: 'EMD', icon: 'shield' },
  { key: 'estimatedValue', label: 'Estimated value', icon: 'rupee' },
  { key: 'tenderFee', label: 'Tender fee', icon: 'file' },
  { key: 'contractDuration', label: 'Contract duration', icon: 'clock' },
  { key: 'openingDate', label: 'Bid opening', icon: 'calendar', isDate: true },
];

function FactValue({ field, isDate }: { field: OverviewField; isDate: boolean }) {
  if (!field) return <span className="key-fact-missing">Not found in document</span>;
  const value = isDate ? (formatDate(field.value) ?? field.value) : field.value;
  return <EvidenceTooltip value={value} sourcePage={field.sourcePage} evidenceText={field.evidenceText} />;
}

export function KeyFacts({ overview }: { overview: TenderDetail['overview'] }) {
  const deadline = overview.submissionDeadline?.value ?? null;
  const dueIn = daysUntil(deadline);
  const dueSoon = dueIn !== null && dueIn >= 0 && dueIn <= 7;

  return (
    <dl className="fact-rows">
      {FACTS.map(({ key, label, icon, isDate = false }) => {
        const relative = key === 'submissionDeadline' ? relativeDays(deadline) : null;
        return (
          <div key={key} className={`fact-row${key === 'submissionDeadline' && dueSoon ? ' fact-row-alert' : ''}`}>
            <dt className="fact-label"><Icon name={icon} />{label}</dt>
            <dd className="fact-value">
              <FactValue field={overview[key]} isDate={isDate} />
              {relative && <span className="fact-hint">{dueIn !== null && dueIn < 0 ? `closed ${relative}` : relative}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
