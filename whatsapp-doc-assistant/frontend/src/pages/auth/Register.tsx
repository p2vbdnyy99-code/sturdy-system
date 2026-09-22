import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { register, type RegisterResult } from '../../api/auth';
import { ApiError } from '../../api/client';
import { PRODUCT_NAME } from '../../config/product';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await register({ email, password, name: name || undefined });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="page">
        <h1>Check your email</h1>
        <p>We've sent a verification link to <strong>{result.email}</strong>.</p>
        {/* devVerificationUrl only ever appears outside production — see
            routes/auth.js's devDeliverVerificationLink(). Real deployments
            never see this branch render. */}
        {result.devVerificationUrl && (
          <p className="notice">
            Dev mode — no email provider configured.{' '}
            <a href={result.devVerificationUrl}>Click here to verify</a>.
          </p>
        )}
        <p>
          Already verified? <Link to="/login">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Create your {PRODUCT_NAME} account</h1>
      <form onSubmit={onSubmit}>
        <label className="field">
          Name
          <input type="text" autoComplete="name" value={name}
            onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Email
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" required autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>
      <p className="footer-note">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
