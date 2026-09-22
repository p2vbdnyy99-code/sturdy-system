import { Link, useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../api/auth';
import { useSession } from '../auth/SessionProvider';
import { PRODUCT_NAME } from '../config/product';

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

  return (
    <header className="app-header">
      <div className="app-header-nav">
        <Link to="/dashboard" className="app-header-brand"><strong>{PRODUCT_NAME}</strong></Link>
        {me && selectedCompanyId && <Link to="/company-profile">Company profile</Link>}
      </div>
      {me && (
        <div className="app-header-user">
          <span className="muted">{me.email}</span>
          <button type="button" onClick={onLogout}>Log out</button>
        </div>
      )}
    </header>
  );
}
