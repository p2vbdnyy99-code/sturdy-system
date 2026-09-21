// Placeholder — the real dashboard (summary tiles + tender table) is M5c.
// This exists so M5b's login/onboarding flow has somewhere real to land.
import { AppHeader } from '../components/AppHeader';
import { useSession } from '../auth/SessionProvider';

export function DashboardPage() {
  const { me, selectedCompanyId } = useSession();
  const company = me?.companies.find((c) => c.companyId === selectedCompanyId);

  return (
    <div>
      <AppHeader />
      <div className="page-body">
        <h1>Dashboard</h1>
        <p className="muted">
          {company ? `Working in ${company.name}.` : 'No company selected.'}
        </p>
        <p className="field-hint">Tender list and summary coming in a later milestone.</p>
      </div>
    </div>
  );
}
