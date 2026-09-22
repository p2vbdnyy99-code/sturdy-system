import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../../api/auth';
import { ApiError } from '../../api/client';

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

  return (
    <div className="page">
      {state.status === 'verifying' && <p>Verifying…</p>}
      {state.status === 'verified' && (
        <>
          <h1>Email verified</h1>
          <p>
            <strong>{state.email}</strong> is now verified. <Link to="/login">Log in</Link>
          </p>
        </>
      )}
      {state.status === 'error' && (
        <>
          <h1>Verification failed</h1>
          <p role="alert" className="error-text">{state.message}</p>
          <p><Link to="/login">Back to login</Link></p>
        </>
      )}
    </div>
  );
}
