import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { Requirement } from '../api/tenders';

function groupByCategory(requirements: Requirement[]): Array<[string, Requirement[]]> {
  const groups = new Map<string, Requirement[]>();
  for (const req of requirements) {
    const list = groups.get(req.category) ?? [];
    list.push(req);
    groups.set(req.category, list);
  }
  return Array.from(groups.entries());
}

function RequirementCard({ requirement }: { requirement: Requirement }) {
  const [primary, ...rest] = requirement.evidence;
  return (
    <li className="requirement-card">
      <div className="requirement-card-header">
        {requirement.mandatory && <span className="badge badge-warning">Mandatory</span>}
        {requirement.title && <span className="requirement-title">{requirement.title}</span>}
      </div>
      <p>
        <EvidenceTooltip
          value={requirement.description}
          sourcePage={primary?.sourcePage ?? null}
          evidenceText={primary?.evidenceText ?? null}
        />
      </p>
      {rest.length > 0 && (
        <ul className="requirement-extra-evidence">
          {rest.map((ev, i) => (
            <li key={i}>
              {ev.sourcePage && <span className="evidence-page">Page {ev.sourcePage}</span>}
              {ev.evidenceText && <span className="evidence-quote">&ldquo;{ev.evidenceText}&rdquo;</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function RequirementsTab({ requirements }: { requirements: Requirement[] }) {
  if (requirements.length === 0) {
    return <EmptyState title="No evidence-backed requirements were extracted" />;
  }

  return (
    <div>
      {groupByCategory(requirements).map(([category, items]) => (
        <div key={category} className="requirement-group">
          <h2>{category}</h2>
          <ul className="requirement-list">
            {items.map((req) => (
              <RequirementCard key={req.id} requirement={req} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
