import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, register } from '../../api/auth';
import { ApiError } from '../../api/client';
import { AuthLayout } from '../../components/AuthLayout';
import { FREE_TRIAL_TENDERS } from '../../config/site';
import { useSession } from '../../auth/SessionProvider';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set when the account was created but signing in automatically failed.
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    let created: string;
    try {
      created = (await register({ email, password, name: name || undefined })).email;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }
    // No email provider is connected and login doesn't require a verified
    // address, so sign the new user straight in rather than promising an
    // email that never arrives. CompanyGate sends a new user on to set up
    // their company.
    try {
      await login({ email, password });
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch {
      setCreatedEmail(created);
      setSubmitting(false);
    }
  }

  if (createdEmail) {
    return (
      <AuthLayout title="Your account is ready">
        <p>Your account for <strong>{createdEmail}</strong> has been created. Log in to set up your company and
          upload your first tender.</p>
        <Link to="/login" className="btn-link btn-primary">Log in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Start your free trial"
      subtitle={`Your first ${FREE_TRIAL_TENDERS} tenders are free. No card needed.`}
      footer={<>Already have an account? <Link to="/login">Log in</Link></>}
    >
      <form onSubmit={onSubmit}>
        <label className="field">
          Your name <span className="field-hint">(optional)</span>
          <input type="text" autoComplete="name" value={name}
            onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Email
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password <span className="field-hint">(at least 8 characters)</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Creating account…' : 'Start free trial'}
        </button>
      </form>
    </AuthLayout>
  );
}
