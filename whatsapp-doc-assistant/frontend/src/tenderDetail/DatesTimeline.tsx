import type { TenderDate } from '../api/tenders';
import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { formatDate } from '../format';
import { buildTimeline, daysPhrase } from './timeline';

// The tender's dates on one line with a "today" marker, in place of the
// reference design's chart. Undated items are listed as written.
export function DatesTimeline({ dates }: { dates: TenderDate[] }) {
  const { entries, undated } = buildTimeline(dates);
  if (entries.length === 0 && undated.length === 0) {
    return <p className="muted timeline-empty">No dates were found in the document.</p>;
  }
  return (
    <div className="timeline">
      <ol className="timeline-list">
        {entries.map((e, i) => (e.kind === 'today'
          ? (
            <li key={`today-${i}`} className="timeline-today">
              <span className="timeline-dot" aria-hidden="true" />
              <span className="timeline-today-label">Today</span>
            </li>
          ) : (
            <li key={e.item.id} className={`timeline-item${e.past ? ' timeline-past' : ''}${!e.past && e.days <= 7 ? ' timeline-soon' : ''}`}>
              <span className="timeline-dot" aria-hidden="true" />
              <span className="timeline-label">{e.item.label}</span>
              <span className="timeline-when">
                <EvidenceTooltip
                  value={formatDate(e.item.parsedDate) ?? e.item.rawText}
                  sourcePage={e.item.sourcePage}
                  evidenceText={e.item.evidenceText}
                />
                <span className="timeline-days">{daysPhrase(e.days)}</span>
              </span>
            </li>
          )))}
      </ol>
      {undated.length > 0 && (
        <ul className="timeline-undated">
          {undated.map((d) => (
            <li key={d.id}>
              <span className="timeline-label">{d.label}</span>
              <span className="muted">{d.rawText}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
