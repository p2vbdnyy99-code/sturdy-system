import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../../api/auth';
import { ApiError } from '../../api/client';
import { AuthLayout } from '../../components/AuthLayout';

type State = { status: 'verifying' } | { status: 'verified'; email: string } | { status: 'error'; message: string };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ status: 'verifying' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'No verification token was provided.' });
      return;
    }
    verifyEmail(token)
      .then((res) => setState({ status: 'verified', email: res.email }))
      .catch((err) =>
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        }),
      );
  }, [token]);

  const title = state.status === 'verified' ? 'Email verified'
    : state.status === 'error' ? 'Verification failed' : 'Verifying your email…';

  return (
    <AuthLayout title={title}>
      {state.status === 'verifying' && <p className="muted">One moment…</p>}
      {state.status === 'verified' && (
        <>
          <p><strong>{state.email}</strong> is now verified.</p>
          <Link to="/login" className="btn-link btn-primary">Log in</Link>
        </>
      )}
      {state.status === 'error' && (
        <>
          <p role="alert" className="error-text">{state.message}</p>
          <p><Link to="/login">Back to login</Link></p>
        </>
      )}
    </AuthLayout>
  );
}
