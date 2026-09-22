import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { BoqItem } from '../api/tenders';

export function BoqTab({ items }: { items: BoqItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="No BOQ items were identified" />;
  }

  return (
    <table className="tender-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Technical specification</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.itemNumber || '—'}</td>
            <td>
              <EvidenceTooltip value={item.description} sourcePage={item.sourcePage} evidenceText={null} />
            </td>
            <td>{item.quantity || '—'}</td>
            <td>{item.unit || '—'}</td>
            <td>{item.technicalSpecification || '—'}</td>
            <td>{item.remarks || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
