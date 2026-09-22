import { EvidenceTooltip } from '../components/EvidenceTooltip';
import { EmptyState } from '../components/EmptyState';
import type { EligibilityStatus, Requirement } from '../api/tenders';

const ELIGIBILITY_BADGE: Record<EligibilityStatus, { label: string; className: string }> = {
  MEETS: { label: 'You appear to meet this', className: 'badge badge-success' },
  DOES_NOT_APPEAR_TO_MEET: { label: "You don't appear to meet this", className: 'badge badge-danger' },
  UNKNOWN: { label: 'Not checked against your profile', className: 'badge badge-neutral' },
};

function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  const { label, className } = ELIGIBILITY_BADGE[status];
  return <span className={className}>{label}</span>;
}

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
        <EligibilityBadge status={requirement.companyStatus} />
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
      {requirement.companyStatus !== 'UNKNOWN' && requirement.companyEvidence.length > 0 && (
        <ul className={`company-evidence ${requirement.companyStatus === 'MEETS' ? 'company-evidence-positive' : 'company-evidence-negative'}`}>
          {requirement.companyEvidence.map((ev, i) => (
            <li key={i}>
              <span className="company-evidence-field">{ev.label}: {ev.value}</span>
              <span className="company-evidence-reason">{ev.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {requirement.companyStatus === 'UNKNOWN' && requirement.actionRequired && (
        <p className="company-evidence-action muted">{requirement.actionRequired}</p>
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
