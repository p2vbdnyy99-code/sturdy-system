import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { OverviewField, TenderDetail } from '../api/tenders';
import { formatDate } from '../format';

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
  return formatDate(field.value) ?? field.value;
}

function OverviewValue({ field, isDateField }: { field: NonNullable<OverviewField>; isDateField: boolean }) {
  return (
    <EvidenceTooltip
      value={displayValue(field, isDateField)}
      sourcePage={field.sourcePage}
      evidenceText={field.evidenceText}
    />
  );
}

// Found fields are listed; the ones not found are named together underneath
// instead of as a column of "Not extracted" rows.
export function OverviewTab({ tender }: { tender: TenderDetail }) {
  const found = FIELDS.filter(({ key }) => tender.overview[key]);
  const missing = FIELDS.filter(({ key }) => !tender.overview[key]);

  if (found.length === 0) {
    return (
      <EmptyState
        title="No overview details yet"
        message={tender.analysisStatus === 'COMPLETED'
          ? 'None of the overview fields were found in this document.'
          : 'They appear here once the document has been analysed.'}
      />
    );
  }

  return (
    <>
      <dl className="overview-list">
        {found.map(({ key, label }) => (
          <div className="overview-row" key={key}>
            <dt>{label}</dt>
            <dd><OverviewValue field={tender.overview[key]!} isDateField={DATE_FIELD_KEYS.has(key)} /></dd>
          </div>
        ))}
      </dl>
      {missing.length > 0 && (
        <p className="overview-missing">
          <span>Not found in this document:</span> {missing.map((f) => f.label).join(', ')}
        </p>
      )}
    </>
  );
}
