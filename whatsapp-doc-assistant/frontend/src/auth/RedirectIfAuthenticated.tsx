// The inverse of RequireSession — keeps an already-logged-in user from
// landing on /login or /register. Loading state renders nothing rather than
// the form, to avoid a flash of the login page before /me resolves.
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from './SessionProvider';

export function RedirectIfAuthenticated() {
  const { status } = useSession();
  if (status === 'loading') return null;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
