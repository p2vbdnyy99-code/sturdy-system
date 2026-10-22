// Route guard. Per the approved session flow: SESSION_LOADING must render
// as a neutral loading state, never a login-page flicker — only an actually
// resolved 401 redirects to /login.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './SessionProvider';

export function RequireSession() {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="page-loading">Loading…</div>;
  }

  if (status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
