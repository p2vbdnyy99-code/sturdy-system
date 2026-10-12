import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';
import { useSession } from '../../auth/SessionProvider';
import { ApiError } from '../../api/client';
import {
  getCompanyProfile, updateCompanyProfile,
  type CompanyProfile, type CompanyProfilePatch,
} from '../../api/companies';
import { PROFILE_FIELDS, describeMissing, type ProfileField, type ProfileFieldKey } from '../../profileFields';

// The eligibility check's other input (see eligibilityPipeline.js): every
// field here is something the AI can cite as a reason against a tender
// requirement. Every field is mandatory; until all are answered the app
// opens on this page (CompanyGate) and the server refuses uploads and
// analysis. List-type fields can be answered "None" rather than invented.

type ExperienceRow = { description: string; value: string; year: string; client: string };
type FormState = Record<Exclude<ProfileFieldKey, 'experience'>, string> & { experience: ExperienceRow[] };

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

/** A field answered "None" is sent empty, so stale values can't linger. */
function formToPatch(form: FormState, none: Set<string>): CompanyProfilePatch {
  const text = (k: keyof FormState) => (none.has(k) ? null : (form[k] as string).trim() || null);
  const list = (k: keyof FormState) => (none.has(k) ? [] : splitList(form[k] as string));
  return {
    industry: text('industry'),
    businessType: text('businessType'),
    gstin: text('gstin'),
    registrationDetails: text('registrationDetails'),
    yearsInBusiness: form.yearsInBusiness.trim() ? Number(form.yearsInBusiness) : null,
    annualTurnover: form.annualTurnover.trim() || null,
    netWorth: form.netWorth.trim() || null,
    employeeCount: form.employeeCount.trim() ? Number(form.employeeCount) : null,
    geography: list('geography'),
    certifications: list('certifications'),
    licenses: list('licenses'),
    equipment: list('equipment'),
    oemRelationships: list('oemRelationships'),
    experience: none.has('experience') ? [] : form.experience
      .filter((e) => e.description.trim() || e.value.trim() || e.year.trim() || e.client.trim())
      .map((e) => ({
        description: e.description.trim(), value: e.value.trim(), year: e.year.trim(), client: e.client.trim(),
      })),
    otherQualifications: text('otherQualifications'),
    noneFields: [...none],
  };
}

export function CompanyProfilePage() {
  const { me, selectedCompanyId, refresh } = useSession();
  const companyId = selectedCompanyId as string; // CompanyGate guarantees this
  const navigate = useNavigate();
  const setup = !me?.companies.find((c) => c.companyId === companyId)?.profileComplete;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [none, setNone] = useState<Set<string>>(new Set());
  const [missing, setMissing] = useState<string[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const profile = await getCompanyProfile(companyId);
      setForm(profileToForm(profile));
      setNone(new Set(profile?.noneFields ?? []));
      setMissing(profile?.missing ?? PROFILE_FIELDS.map((f) => f.key));
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

  function toggleNone(key: string, checked: boolean) {
    setNone((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    setSaved(false);
  }

  function setExperienceRow(i: number, patch: Partial<ExperienceRow>) {
    setForm((f) => ({ ...f, experience: f.experience.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) }));
    setSaved(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateCompanyProfile(companyId, formToPatch(form, none));
      setForm(profileToForm(updated));
      setNone(new Set(updated.noneFields));
      setMissing(updated.missing);
      setShowMissing(true);
      setSaved(true);
      if (updated.missing.length === 0) {
        await refresh(); // the company is now marked complete, so CompanyGate lets the app open
        if (setup) navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save your company profile.');
    } finally {
      setSaving(false);
    }
  }

  const isMissing = (key: string) => showMissing && missing.includes(key);

  function renderField(field: ProfileField) {
    const { key } = field;
    const disabled = none.has(key);
    const labelText = (
      <>
        {field.label} <span className="field-required" aria-hidden="true">*</span>
        {field.hint && <span className="field-hint"> ({field.hint})</span>}
      </>
    );
    const noneBox = field.noneLabel && (
      <label className="field-none">
        <input type="checkbox" checked={disabled} onChange={(e) => toggleNone(key, e.target.checked)} />
        {field.noneLabel}
      </label>
    );

    if (field.kind === 'experience') {
      return (
        <div key={key} className={`field${isMissing(key) ? ' field-missing' : ''}`}>
          {labelText}
          {!disabled && (
            <>
              <ul className="experience-rows">
                {form.experience.map((row, i) => (
                  <li key={i} className="experience-row">
                    <input type="text" placeholder="Description" aria-label="Project description" value={row.description}
                      onChange={(e) => setExperienceRow(i, { description: e.target.value })} />
                    <input type="text" placeholder="Value (e.g. ₹2 crore)" aria-label="Project value" value={row.value}
                      onChange={(e) => setExperienceRow(i, { value: e.target.value })} />
                    <input type="text" placeholder="Year" aria-label="Year" value={row.year}
                      onChange={(e) => setExperienceRow(i, { year: e.target.value })} />
                    <input type="text" placeholder="Client" aria-label="Client" value={row.client}
                      onChange={(e) => setExperienceRow(i, { client: e.target.value })} />
                    <button type="button" aria-label="Remove this project"
                      onClick={() => set('experience', form.experience.filter((_, idx) => idx !== i))}>Remove</button>
                  </li>
                ))}
              </ul>
              <button type="button"
                onClick={() => set('experience', [...form.experience, { description: '', value: '', year: '', client: '' }])}>
                + Add past project
              </button>
            </>
          )}
          {noneBox}
        </div>
      );
    }

    const value = form[key as Exclude<ProfileFieldKey, 'experience'>];
    return (
      <div key={key} className={`field${isMissing(key) ? ' field-missing' : ''}`}>
        <label htmlFor={`profile-${key}`}>{labelText}</label>
        <input
          id={`profile-${key}`}
          type={field.kind === 'number' ? 'number' : 'text'}
          min={field.kind === 'number' ? 0 : undefined}
          inputMode={field.kind === 'amount' ? 'decimal' : undefined}
          value={disabled ? '' : value}
          disabled={disabled}
          aria-invalid={isMissing(key) || undefined}
          onChange={(e) => set(key as Exclude<ProfileFieldKey, 'experience'>, e.target.value)}
        />
        {noneBox}
      </div>
    );
  }

  return (
    <div>
      <AppHeader />
      <div className="page-body">
        <h1>Company profile</h1>
        {setup ? (
          <div className="notice notice-info profile-setup-notice">
            <span className="notice-text">
              <strong>One step before your first tender.</strong> Fill in every field below. The eligibility check
              compares each tender&rsquo;s conditions with these details, so complete answers give clearer results.
              If something doesn&rsquo;t apply to you, tick &ldquo;None&rdquo;.
            </span>
          </div>
        ) : (
          <p className="muted">
            This is what the eligibility check compares against your tenders&rsquo; requirements. Every field is
            required; keep it up to date for the most accurate results.
          </p>
        )}

        {loading && <p className="muted">Loading…</p>}
        {!loading && loadError && (
          <p role="alert" className="error-text">{loadError} <button type="button" onClick={fetchProfile}>Retry</button></p>
        )}

        {!loading && !loadError && (
          <form onSubmit={onSubmit} className="profile-form" noValidate>
            <div className="profile-grid">
              {PROFILE_FIELDS.filter((f) => f.kind !== 'list' && f.kind !== 'experience' && f.key !== 'otherQualifications').map(renderField)}
            </div>
            {PROFILE_FIELDS.filter((f) => f.kind === 'list' || f.kind === 'experience' || f.key === 'otherQualifications').map(renderField)}

            {saveError && <p role="alert" className="error-text">{saveError}</p>}
            {showMissing && missing.length > 0 && !saving && (
              <p role="alert" className="error-text">
                Saved, but still needed: {describeMissing(missing)}. Fill these in or tick &ldquo;None&rdquo; where it applies.
              </p>
            )}
            {saved && !saving && missing.length === 0 && <p className="save-confirmation">Saved. Your profile is complete.</p>}
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? 'Saving…' : setup ? 'Save and continue' : 'Save company profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
