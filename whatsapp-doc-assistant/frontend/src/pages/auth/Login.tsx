import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useSession } from '../../auth/SessionProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { PRODUCT_NAME } from '../../config/product';
import { OtherSignIn } from '../../components/OtherSignIn';
import { safeNextPath } from '../../auth/safeNext';

const SIGNIN_MESSAGES: Record<string, string> = {
  google_failed: 'Google sign-in didn’t work. Please try again, or use another way to log in.',
  google_cancelled: 'Google sign-in was cancelled.',
};

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      await refresh();
      // Company-count-based routing (onboarding vs. dashboard vs. selector)
      // is CompanyGate's job, not this page's — always land on the
      // requested route (or /dashboard), let the gate redirect from there.
      navigate(safeNextPath(`?${params.toString()}`), { replace: true });
    } catch (err) {
      // Deliberately echo the backend's own message verbatim — it's already
      // generic ("Invalid email or password") to avoid enumeration; the
      // frontend must not phrase it more specifically. See routes/auth.js.
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see your tenders."
      footer={<>New to {PRODUCT_NAME}? <Link to="/register">Start your free trial</Link></>}
    >
      {params.get('signin') && SIGNIN_MESSAGES[params.get('signin') as string] && (
        <p role="alert" className="error-text">{SIGNIN_MESSAGES[params.get('signin') as string]}</p>
      )}
      <OtherSignIn mode="login" />
      <form onSubmit={onSubmit}>
        <label className="field">
          Email
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
