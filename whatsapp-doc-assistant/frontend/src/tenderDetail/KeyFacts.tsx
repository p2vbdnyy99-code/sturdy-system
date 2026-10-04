import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { Icon, type IconName } from '../components/Icon';
import type { OverviewField, TenderDetail } from '../api/tenders';
import { daysUntil, formatDate, relativeDays } from '../format';

// The four facts a contractor checks first, lifted out of the Overview list
// to the top of the page. Same overview data and evidence chips; a missing
// value says so plainly rather than leaving a gap.
const FACTS: Array<{ key: 'submissionDeadline' | 'emd' | 'estimatedValue' | 'tenderFee'; label: string; icon: IconName }> = [
  { key: 'submissionDeadline', label: 'Deadline', icon: 'calendar' },
  { key: 'emd', label: 'EMD', icon: 'shield' },
  { key: 'estimatedValue', label: 'Estimated value', icon: 'rupee' },
  { key: 'tenderFee', label: 'Tender fee', icon: 'file' },
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
    <div className="key-facts">
      {FACTS.map(({ key, label, icon }) => {
        const isDate = key === 'submissionDeadline';
        const relative = isDate ? relativeDays(deadline) : null;
        return (
          <div key={key} className={`key-fact${isDate && dueSoon ? ' key-fact-due-soon' : ''}`}>
            <span className="key-fact-label"><Icon name={icon} />{label}</span>
            <span className="key-fact-value"><FactValue field={overview[key]} isDate={isDate} /></span>
            {relative && <span className="key-fact-hint">{dueIn !== null && dueIn < 0 ? `Closed ${relative}` : `Closes ${relative}`}</span>}
          </div>
        );
      })}
    </div>
  );
}
