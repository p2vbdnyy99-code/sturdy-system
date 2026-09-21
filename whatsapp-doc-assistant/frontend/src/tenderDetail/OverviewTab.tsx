import { EvidenceTooltip } from '../components/EvidenceTooltip';
import type { OverviewField, TenderDetail } from '../api/tenders';

// submissionDeadline/openingDate are the only two overview fields backed by
// a typed timestamp column — their value arrives as an ISO string and needs
// the same display formatting DatesTab/TenderRow apply, unlike every other
// overview field, which is free text extracted verbatim.
const DATE_FIELD_KEYS = new Set<keyof TenderDetail['overview']>(['submissionDeadline', 'openingDate']);

const FIELDS: Array<{ key: keyof TenderDetail['overview']; label: string }> = [
  { key: 'organization', label: 'Organization' },
  { key: 'tenderNumber', label: 'Tender number' },
  { key: 'location', label: 'Location' },
  { key: 'estimatedValue', label: 'Estimated value' },
  { key: 'emd', label: 'EMD' },
  { key: 'tenderFee', label: 'Tender fee' },
  { key: 'contractDuration', label: 'Contract duration' },
  { key: 'submissionDeadline', label: 'Submission deadline' },
  { key: 'openingDate', label: 'Opening date' },
];

function displayValue(field: NonNullable<OverviewField>, isDateField: boolean): string {
  if (!isDateField) return field.value;
  const d = new Date(field.value);
  return Number.isNaN(d.getTime()) ? field.value : d.toLocaleDateString();
}

function OverviewValue({ field, isDateField }: { field: OverviewField; isDateField: boolean }) {
  if (!field) return <span className="muted">Not extracted</span>;
  return (
    <EvidenceTooltip
      value={displayValue(field, isDateField)}
      sourcePage={field.sourcePage}
      evidenceText={field.evidenceText}
    />
  );
}

export function OverviewTab({ tender }: { tender: TenderDetail }) {
  return (
    <dl className="overview-list">
      {FIELDS.map(({ key, label }) => (
        <div className="overview-row" key={key}>
          <dt>{label}</dt>
          <dd><OverviewValue field={tender.overview[key]} isDateField={DATE_FIELD_KEYS.has(key)} /></dd>
        </div>
      ))}
    </dl>
  );
}
