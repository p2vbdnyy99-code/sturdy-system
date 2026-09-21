// Resolves company selection per the approved M5 contract: 0 companies ->
// onboarding, 1 -> already auto-selected by SessionProvider, >1 -> a simple
// selector (no persistence, no "active company" server concept — see
// SessionProvider.tsx). Wraps any route that needs a selected company.
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from './SessionProvider';
import { PRODUCT_NAME } from '../config/product';

export function CompanyGate({ children }: { children: ReactNode }) {
  const { me, selectedCompanyId, selectCompany } = useSession();

  if (!me) return null; // CompanyGate is always used inside RequireSession

  if (me.companies.length === 0) {
    return <Navigate to="/onboarding/create-company" replace />;
  }

  if (me.companies.length > 1 && !selectedCompanyId) {
    return (
      <div className="page">
        <h1>Choose a company</h1>
        <p>You belong to more than one company on {PRODUCT_NAME}. Which one do you want to work in?</p>
        <ul className="company-list">
          {me.companies.map((c) => (
            <li key={c.companyId}>
              <button type="button" onClick={() => selectCompany(c.companyId)} className="company-option">
                {c.name} <span className="muted">({c.role})</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <>{children}</>;
}
