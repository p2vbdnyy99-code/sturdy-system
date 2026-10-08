import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../api/auth';
import { useSession } from '../auth/SessionProvider';
import { Logo } from './Logo';
import { Icon } from './Icon';

export function AppHeader() {
  const { me, selectedCompanyId, clear } = useSession();
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await apiLogout();
    } finally {
      // Clear local state regardless of whether the network call succeeded —
      // an already-expired session shouldn't trap the user on a dead page.
      clear();
      navigate('/login', { replace: true });
    }
  }

  const company = me?.companies.find((c) => c.companyId === selectedCompanyId);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-nav">
          <Link to="/dashboard" className="app-header-brand" aria-label="Dashboard">
            <Logo tone="light" size={30} />
          </Link>
          {me && selectedCompanyId && (
            <nav className="app-header-links" aria-label="Main">
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/company-profile">Company profile</NavLink>
            </nav>
          )}
        </div>
        {me && (
          <div className="app-header-user">
            <span className="app-header-avatar" aria-hidden="true">
              {(me.email[0] ?? '?').toUpperCase()}
            </span>
            <span className="app-header-identity">
              {company && <span className="app-header-company">{company.name}</span>}
              <span className="app-header-email">{me.email}</span>
            </span>
            <button type="button" className="app-header-logout" onClick={onLogout}>
              <Icon name="logout" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
