import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppHeader } from '../../components/AppHeader';
import { useSession } from '../../auth/SessionProvider';
import { ApiError } from '../../api/client';
import {
  getCompanyProfile, updateCompanyProfile,
  type CompanyProfile, type CompanyProfilePatch,
} from '../../api/companies';

// The eligibility engine's other input (see eligibilityPipeline.js) — every
// field here is exactly one PROFILE_FIELD_LABELS entry the AI can cite as a
// reason against a tender requirement. Built for Beta Readiness: the API
// client (api/companies.ts) and backend routes existed since M5-era work,
// but nothing let a user actually fill this in — every eligibility check
// was landing on "Complete your company profile" with no way to do so.

type ExperienceRow = { description: string; value: string; year: string; client: string };

type FormState = {
  industry: string;
  businessType: string;
  gstin: string;
  registrationDetails: string;
  yearsInBusiness: string;
  annualTurnover: string;
  netWorth: string;
  employeeCount: string;
  geography: string;
  certifications: string;
  licenses: string;
  equipment: string;
  oemRelationships: string;
  experience: ExperienceRow[];
  otherQualifications: string;
};

const EMPTY_FORM: FormState = {
  industry: '', businessType: '', gstin: '', registrationDetails: '',
  yearsInBusiness: '', annualTurnover: '', netWorth: '', employeeCount: '',
  geography: '', certifications: '', licenses: '', equipment: '', oemRelationships: '',
  experience: [], otherQualifications: '',
};

function profileToForm(profile: CompanyProfile | null): FormState {
  if (!profile) return EMPTY_FORM;
  return {
    industry: profile.industry ?? '',
    businessType: profile.businessType ?? '',
    gstin: profile.gstin ?? '',
    registrationDetails: profile.registrationDetails ?? '',
    yearsInBusiness: profile.yearsInBusiness != null ? String(profile.yearsInBusiness) : '',
    annualTurnover: profile.annualTurnover ?? '',
    netWorth: profile.netWorth ?? '',
    employeeCount: profile.employeeCount != null ? String(profile.employeeCount) : '',
    geography: profile.geography.join(', '),
    certifications: profile.certifications.join(', '),
    licenses: profile.licenses.join(', '),
    equipment: profile.equipment.join(', '),
    oemRelationships: profile.oemRelationships.join(', '),
    experience: profile.experience.map((e) => ({
      description: e.description ?? '', value: e.value ?? '', year: e.year ?? '', client: e.client ?? '',
    })),
    otherQualifications: profile.otherQualifications ?? '',
  };
}

function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function formToPatch(form: FormState): CompanyProfilePatch {
  return {
    industry: form.industry.trim() || null,
    businessType: form.businessType.trim() || null,
    gstin: form.gstin.trim() || null,
    registrationDetails: form.registrationDetails.trim() || null,
    yearsInBusiness: form.yearsInBusiness.trim() ? Number(form.yearsInBusiness) : null,
    annualTurnover: form.annualTurnover.trim() || null,
    netWorth: form.netWorth.trim() || null,
    employeeCount: form.employeeCount.trim() ? Number(form.employeeCount) : null,
    geography: splitList(form.geography),
    certifications: splitList(form.certifications),
    licenses: splitList(form.licenses),
    equipment: splitList(form.equipment),
    oemRelationships: splitList(form.oemRelationships),
    experience: form.experience
      .filter((e) => e.description.trim() || e.value.trim() || e.year.trim() || e.client.trim())
      .map((e) => ({
        description: e.description.trim(), value: e.value.trim(), year: e.year.trim(), client: e.client.trim(),
      })),
    otherQualifications: form.otherQualifications.trim() || null,
  };
}

export function CompanyProfilePage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string; // CompanyGate guarantees this

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setForm(profileToForm(await getCompanyProfile(companyId)));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your company profile.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function setExperienceRow(i: number, patch: Partial<ExperienceRow>) {
    setForm((f) => ({
      ...f,
      experience: f.experience.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    }));
    setSaved(false);
  }

  function addExperienceRow() {
    setForm((f) => ({ ...f, experience: [...f.experience, { description: '', value: '', year: '', client: '' }] }));
  }

  function removeExperienceRow(i: number) {
    setForm((f) => ({ ...f, experience: f.experience.filter((_, idx) => idx !== i) }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateCompanyProfile(companyId, formToPatch(form));
      setForm(profileToForm(updated));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save your company profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AppHeader />
      <div className="page-body">
        <h1>Company profile</h1>
        <p className="muted">
          This is what the eligibility check compares against your tenders' requirements — every field
          here is something the AI can cite as a real reason, never a value it invents.
        </p>

        {loading && <p className="muted">Loading…</p>}
        {!loading && loadError && (
          <p role="alert" className="error-text">{loadError} <button type="button" onClick={fetchProfile}>Retry</button></p>
        )}

        {!loading && !loadError && (
          <form onSubmit={onSubmit} className="profile-form">
            <div className="profile-grid">
              <label className="field">
                Industry
                <input type="text" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
              </label>
              <label className="field">
                Business type
                <input type="text" value={form.businessType} onChange={(e) => set('businessType', e.target.value)} />
              </label>
              <label className="field">
                GSTIN
                <input type="text" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
              </label>
              <label className="field">
                Registration details
                <input type="text" value={form.registrationDetails} onChange={(e) => set('registrationDetails', e.target.value)} />
              </label>
              <label className="field">
                Years in business
                <input type="number" min="0" value={form.yearsInBusiness} onChange={(e) => set('yearsInBusiness', e.target.value)} />
              </label>
              <label className="field">
                Employee count
                <input type="number" min="0" value={form.employeeCount} onChange={(e) => set('employeeCount', e.target.value)} />
              </label>
              <label className="field">
                Annual turnover
                <input type="text" inputMode="decimal" value={form.annualTurnover} onChange={(e) => set('annualTurnover', e.target.value)} />
              </label>
              <label className="field">
                Net worth
                <input type="text" inputMode="decimal" value={form.netWorth} onChange={(e) => set('netWorth', e.target.value)} />
              </label>
            </div>

            <label className="field">
              Geography <span className="field-hint">(comma-separated)</span>
              <input type="text" value={form.geography} onChange={(e) => set('geography', e.target.value)} />
            </label>
            <label className="field">
              Certifications <span className="field-hint">(comma-separated)</span>
              <input type="text" value={form.certifications} onChange={(e) => set('certifications', e.target.value)} />
            </label>
            <label className="field">
              Licenses <span className="field-hint">(comma-separated)</span>
              <input type="text" value={form.licenses} onChange={(e) => set('licenses', e.target.value)} />
            </label>
            <label className="field">
              Equipment <span className="field-hint">(comma-separated)</span>
              <input type="text" value={form.equipment} onChange={(e) => set('equipment', e.target.value)} />
            </label>
            <label className="field">
              OEM relationships <span className="field-hint">(comma-separated)</span>
              <input type="text" value={form.oemRelationships} onChange={(e) => set('oemRelationships', e.target.value)} />
            </label>
            <label className="field">
              Other qualifications
              <input type="text" value={form.otherQualifications} onChange={(e) => set('otherQualifications', e.target.value)} />
            </label>

            <div className="field">
              Past project experience
              <ul className="experience-rows">
                {form.experience.map((row, i) => (
                  <li key={i} className="experience-row">
                    <input
                      type="text" placeholder="Description" value={row.description}
                      onChange={(e) => setExperienceRow(i, { description: e.target.value })}
                    />
                    <input
                      type="text" placeholder="Value (e.g. ₹2 crore)" value={row.value}
                      onChange={(e) => setExperienceRow(i, { value: e.target.value })}
                    />
                    <input
                      type="text" placeholder="Year" value={row.year}
                      onChange={(e) => setExperienceRow(i, { year: e.target.value })}
                    />
                    <input
                      type="text" placeholder="Client" value={row.client}
                      onChange={(e) => setExperienceRow(i, { client: e.target.value })}
                    />
                    <button type="button" onClick={() => removeExperienceRow(i)} aria-label="Remove this experience entry">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={addExperienceRow}>+ Add past project</button>
            </div>

            {saveError && <p role="alert" className="error-text">{saveError}</p>}
            {saved && !saving && <p className="save-confirmation">Saved.</p>}
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save company profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
