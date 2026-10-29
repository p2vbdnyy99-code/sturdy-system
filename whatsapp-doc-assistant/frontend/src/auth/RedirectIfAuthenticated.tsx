// The inverse of RequireSession — keeps an already-logged-in user from
// landing on /login or /register. Loading state renders nothing rather than
// the form, to avoid a flash of the login page before /me resolves. A signed-in
// user goes to the login page's ?next= path when it is one on this site
// (safeNext.ts), so signing in lands where the link pointed.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './SessionProvider';
import { safeNextPath } from './safeNext';

export function RedirectIfAuthenticated() {
  const { status } = useSession();
  const { search } = useLocation();
  if (status === 'loading') return null;
  if (status === 'authenticated') return <Navigate to={safeNextPath(search)} replace />;
  return <Outlet />;
}
