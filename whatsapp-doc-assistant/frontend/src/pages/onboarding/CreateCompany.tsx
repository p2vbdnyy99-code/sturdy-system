import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCompany } from '../../api/companies';
import { ApiError } from '../../api/client';
import { useSession } from '../../auth/SessionProvider';
import { PRODUCT_NAME } from '../../config/product';

// Deliberately just name + optional industry/businessType — no contact
// fields (there's no column for them; see BIDPILOT_ARCHITECTURE.md's M5a
// entry on why that was dropped from scope rather than improvised). Every
// other company_profiles field is filled in progressively later (M5e).
export function CreateCompanyPage() {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createCompany({
        name,
        industry: industry || undefined,
        businessType: businessType || undefined,
      });
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Set up your company</h1>
      <p className="muted">
        This is what {PRODUCT_NAME} will show your tenders under. You can fill in the rest of your
        company profile later.
      </p>
      <form onSubmit={onSubmit}>
        <label className="field">
          Company name
          <input type="text" required value={name}
            onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Industry <span className="field-hint">(optional)</span>
          <input type="text" value={industry}
            onChange={(e) => setIndustry(e.target.value)} />
        </label>
        <label className="field">
          Business type <span className="field-hint">(optional)</span>
          <input type="text" value={businessType}
            onChange={(e) => setBusinessType(e.target.value)} />
        </label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Creating…' : 'Create company'}
        </button>
      </form>
    </div>
  );
}
