import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSignInProviders, startPhoneSignIn, verifyPhoneSignIn, GOOGLE_SIGN_IN_URL, type SignInProviders,
} from '../api/auth';
import { ApiError } from '../api/client';
import { useSession } from '../auth/SessionProvider';

// "Continue with Google" and "Continue with mobile number" on the login and
// sign-up pages. Each appears only when the server has it configured
// (GET /bidpilot/auth/providers). Both sign in an existing account or create
// a new one, so the same component serves both pages.

function GoogleMark() {
  return (
    <svg className="oauth-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function PhoneSignIn({ askName }: { askName: boolean }) {
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await startPhoneSignIn(phone);
      setSentTo(res.phone);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyPhoneSignIn({ phone: sentTo, code, name: name.trim() || undefined });
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check the code. Please try again.');
      setBusy(false);
    }
  }

  if (step === 'number') {
    return (
      <form onSubmit={send} className="phone-signin">
        {askName && (
          <label className="field">
            Your name <span className="field-hint">(optional)</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="field">
          Mobile number
          <input type="tel" required autoComplete="tel" inputMode="tel" placeholder="98765 43210" value={phone}
            onChange={(e) => setPhone(e.target.value)} />
        </label>
        <p className="field-hint phone-signin-note">We&rsquo;ll send a 6-digit code to this number on WhatsApp.</p>
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={busy} className="submit-button">{busy ? 'Sending…' : 'Send code on WhatsApp'}</button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="phone-signin">
      <p className="phone-signin-note">Enter the code we sent on WhatsApp to <strong>{sentTo}</strong>.</p>
      <label className="field">
        6-digit code
        <input type="text" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7}
          value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button type="submit" disabled={busy} className="submit-button">{busy ? 'Checking…' : 'Continue'}</button>
      <p className="phone-signin-actions">
        <button type="button" className="link-button" disabled={busy} onClick={() => send()}>Send a new code</button>
        <button type="button" className="link-button" disabled={busy} onClick={() => { setStep('number'); setError(null); }}>
          Change number
        </button>
      </p>
    </form>
  );
}

export function OtherSignIn({ mode }: { mode: 'login' | 'register' }) {
  const [providers, setProviders] = useState<SignInProviders | null>(null);
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    getSignInProviders().then(setProviders).catch(() => setProviders({ google: false, phone: false }));
  }, []);

  if (!providers || (!providers.google && !providers.phone)) return null;
  const verb = mode === 'register' ? 'Sign up' : 'Continue';

  return (
    <div className="other-signin">
      {providers.google && (
        <a href={GOOGLE_SIGN_IN_URL} className="btn-oauth">
          <GoogleMark />
          {verb} with Google
        </a>
      )}
      {providers.phone && !showPhone && (
        <button type="button" className="btn-oauth" onClick={() => setShowPhone(true)}>
          <span className="oauth-mark oauth-mark-phone" aria-hidden="true">📱</span>
          {verb} with mobile number
        </button>
      )}
      {providers.phone && showPhone && <PhoneSignIn askName={mode === 'register'} />}
      <p className="auth-divider"><span>or use your email</span></p>
    </div>
  );
}
