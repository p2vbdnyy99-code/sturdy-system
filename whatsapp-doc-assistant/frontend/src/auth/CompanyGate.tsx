// Resolves company selection per the approved M5 contract: 0 companies -> one
// is created for the user, 1 -> already auto-selected by SessionProvider,
// >1 -> a simple selector (no persistence, no "active company" server
// concept — see SessionProvider.tsx). Wraps any route that needs a selected
// company.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from './SessionProvider';
import { PRODUCT_NAME } from '../config/product';
import { AuthLayout } from '../components/AuthLayout';
import { ensureCompany } from '../api/companies';
import { recordVisit } from '../api/visits';

// Since Oct 2026 a new user goes straight to the dashboard: there is no
// "set up your company" form. Every tender belongs to a company, so a user
// without one gets one here, named after them (renamed on the profile page).
// The server makes this safe to repeat (one company per user however many
// tabs call it).
function SetUpWorkspace() {
  const { refresh } = useSession();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setFailed(false);
    try {
      const res = await ensureCompany();
      // Counted as a new account by the funnel report (backend funnelReport.js).
      if (res.created) recordVisit('/signed-up');
      await refresh();
    } catch {
      setFailed(true);
    }
  }, [refresh]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (!failed) return <div className="page-loading">Setting up your workspace…</div>;
  return (
    <AuthLayout title="Something went wrong" subtitle={<>We couldn&rsquo;t set up your {PRODUCT_NAME} workspace.</>}>
      <p role="alert" className="error-text">Please check your connection and try again.</p>
      <button type="button" className="submit-button" onClick={() => void run()}>Try again</button>
    </AuthLayout>
  );
}

export function CompanyGate({ children }: { children: ReactNode }) {
  const { me, selectedCompanyId, selectCompany } = useSession();

  if (!me) return null; // CompanyGate is always used inside RequireSession

  if (me.companies.length === 0) return <SetUpWorkspace />;

  if (me.companies.length > 1 && !selectedCompanyId) {
    return (
      <AuthLayout
        title="Choose a company"
        subtitle={<>You belong to more than one company on {PRODUCT_NAME}. Which one do you want to work in?</>}
      >
        <ul className="company-list">
          {me.companies.map((c) => (
            <li key={c.companyId}>
              <button type="button" onClick={() => selectCompany(c.companyId)} className="company-option">
                {c.name} <span className="muted">({c.role})</span>
              </button>
            </li>
          ))}
        </ul>
      </AuthLayout>
    );
  }

  // The company profile is optional for the first three tenders, so it never
  // comes first; after that the app asks for it in a dialog
  // (components/ProfileRequiredDialog.tsx) and the server waits for it.
  return <>{children}</>;
}
