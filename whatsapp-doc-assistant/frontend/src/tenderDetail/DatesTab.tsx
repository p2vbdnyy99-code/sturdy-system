import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { TenderDate } from '../api/tenders';

function formatDate(date: TenderDate): string {
  if (date.parsedDate) {
    const d = new Date(date.parsedDate);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return date.rawText;
}

export function DatesTab({ dates }: { dates: TenderDate[] }) {
  if (dates.length === 0) {
    return <EmptyState title="No key dates were identified" />;
  }

  return (
    <table className="tender-table">
      <thead>
        <tr>
          <th>Label</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {dates.map((date) => (
          <tr key={date.id}>
            <td>{date.label}</td>
            <td>
              <EvidenceTooltip
                value={formatDate(date)}
                sourcePage={date.sourcePage}
                evidenceText={date.evidenceText}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
