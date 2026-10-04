import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { TenderDate } from '../api/tenders';
import { formatDate as formatCalendarDate } from '../format';

function formatDate(date: TenderDate): string {
  return formatCalendarDate(date.parsedDate) ?? date.rawText;
}

export function DatesTab({ dates }: { dates: TenderDate[] }) {
  if (dates.length === 0) {
    return <EmptyState title="No key dates were identified" />;
  }

  return (
    <div className="table-scroll">
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
    </div>
  );
}
