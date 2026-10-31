import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSecuritiesOverview, type HeldSecurity, type SecuritiesOverview } from '../api/dashboard';
import { Panel } from '../components/AppShell';
import { displayTitle } from '../format';
import { expiryLabel, KIND_LABEL, MODE_LABEL, rupees } from '../tenderDetail/securityLabels';

// "Money with buyers": EMDs and guarantees marked as with the buyer, their
// total, and bank guarantees that expire within 30 days or already have
// (routes/dashboard.js). Shown only once something has been recorded.
export function SecuritiesSummary({ companyId, reloadKey }: { companyId: string; reloadKey?: unknown }) {
  const [data, setData] = useState<SecuritiesOverview | null>(null);
  useEffect(() => {
    getSecuritiesOverview(companyId).then(setData).catch(() => setData(null));
  }, [companyId, reloadKey]);

  if (!data || data.held.count === 0) return null;
  const urgent = [...data.expired, ...data.expiringSoon];
  return (
    <Panel id="money-with-buyers" title="Money with buyers" aside={<span className="panel-count">{data.held.count}</span>}>
      <div className="card securities-summary">
        <p className="securities-total">
          <strong>{rupees(data.held.amount)}</strong>
          <span className="muted">
            {' '}still with buyers ({data.held.count === 1 ? '1 EMD or guarantee' : `${data.held.count} EMDs and guarantees`}
            {data.held.unknownAmounts > 0 && `, ${data.held.unknownAmounts} without an amount`})
          </span>
        </p>
        {urgent.length > 0 && (
          <ul className="securities-urgent">
            {urgent.map((s) => <UrgentRow key={s.id} s={s} />)}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function UrgentRow({ s }: { s: HeldSecurity }) {
  return (
    <li className="securities-urgent-row">
      <Link to={`/tenders/${s.tenderId}`} className="securities-urgent-link">
        <span className="securities-urgent-title">{displayTitle(s.tenderTitle)}</span>
        <span className="muted">
          {KIND_LABEL[s.kind]} · {MODE_LABEL[s.mode]}{s.amount !== null && <> · {rupees(s.amount)}</>}
        </span>
      </Link>
      {s.validUntil && <span className="queue-chip queue-chip-urgent">{expiryLabel(s.validUntil)}</span>}
    </li>
  );
}
