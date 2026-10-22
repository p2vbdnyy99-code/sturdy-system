import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  createSecurity, deleteSecurity, listSecurities, updateSecurity,
  type OverviewField, type Security, type SecurityInput, type SecurityKind, type SecurityMode, type SecurityStatus,
} from '../api/tenders';
import { Panel } from '../components/AppShell';
import { formatDate } from '../format';
import { expiryLabel, daysToDate, KIND_LABEL, MODE_LABEL, rupees, STATUS_LABEL } from './securityLabels';

// "EMD & guarantees": the user's own record of the EMD and performance
// security for this tender (repo/securities.js). The EMD the analysis found
// in the document is shown only as a hint, with its page; nothing is filled
// in from it automatically.
type FormState = {
  kind: SecurityKind; mode: SecurityMode; status: SecurityStatus; amount: string;
  reference: string; bank: string; issuedOn: string; validUntil: string; claimUntil: string; notes: string;
};

const EMPTY: FormState = {
  kind: 'EMD', mode: 'BG', status: 'TO_ARRANGE', amount: '', reference: '', bank: '',
  issuedOn: '', validUntil: '', claimUntil: '', notes: '',
};

const fromSecurity = (s: Security): FormState => ({
  kind: s.kind, mode: s.mode, status: s.status, amount: s.amount === null ? '' : String(s.amount),
  reference: s.reference ?? '', bank: s.bank ?? '', issuedOn: s.issuedOn ?? '', validUntil: s.validUntil ?? '',
  claimUntil: s.claimUntil ?? '', notes: s.notes ?? '',
});

const NO_MONEY: SecurityMode[] = ['EXEMPTED', 'NOT_REQUIRED'];

function toInput(f: FormState): SecurityInput {
  const noMoney = NO_MONEY.includes(f.mode);
  const instrument = f.mode === 'BG' || f.mode === 'FDR' || f.mode === 'DD';
  return {
    kind: f.kind,
    mode: f.mode,
    status: f.status,
    amount: noMoney || !f.amount.trim() ? null : Number(f.amount.replace(/[₹,\s]/g, '')),
    reference: noMoney ? null : f.reference.trim() || null,
    bank: instrument ? f.bank.trim() || null : null,
    issuedOn: instrument ? f.issuedOn || null : null,
    validUntil: f.mode === 'BG' || f.mode === 'FDR' ? f.validUntil || null : null,
    claimUntil: f.mode === 'BG' ? f.claimUntil || null : null,
    notes: f.notes.trim() || null,
  };
}

export function SecuritiesPanel({ tenderId, companyId, emdFromDocument }: {
  tenderId: string;
  companyId: string;
  emdFromDocument: OverviewField;
}) {
  const [items, setItems] = useState<Security[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await listSecurities(tenderId, companyId)).securities);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load EMD details.');
    }
  }, [tenderId, companyId]);
  useEffect(() => { void load(); }, [load]);

  function startNew() {
    setForm(EMPTY);
    setEditing('new');
    setError(null);
  }

  function startEdit(s: Security) {
    setForm(fromSecurity(s));
    setEditing(s.id);
    setError(null);
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') await createSecurity(tenderId, companyId, toInput(form));
      else if (editing) await updateSecurity(tenderId, companyId, editing, toInput(form));
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteSecurity(tenderId, companyId, id);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.');
    }
  }

  async function onStatus(s: Security, status: SecurityStatus) {
    setError(null);
    try {
      await updateSecurity(tenderId, companyId, s.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }

  const noMoney = NO_MONEY.includes(form.mode);
  const instrument = form.mode === 'BG' || form.mode === 'FDR' || form.mode === 'DD';

  return (
    <Panel id="securities" title="EMD & guarantees" aside={items && items.length > 0 ? <span className="panel-count">{items.length}</span> : undefined}>
      <div className="card security-card">
        {emdFromDocument && (
          <p className="security-hint">
            The tender asks for EMD: <strong>{emdFromDocument.value}</strong>
            {emdFromDocument.sourcePage != null && <span className="muted"> (page {emdFromDocument.sourcePage})</span>}
          </p>
        )}
        {items === null && !error && <p className="muted">Loading…</p>}
        {items && items.length === 0 && editing === null && (
          <p className="muted">Record how the EMD is given (online, DD, bank guarantee or exempt) and whether it has come back.</p>
        )}
        {items && items.length > 0 && (
          <ul className="security-list">
            {items.map((s) => (
              <li key={s.id} className="security-item">
                <div className="security-item-top">
                  <span className="security-kind">{KIND_LABEL[s.kind]}</span>
                  <span className="security-amount">{s.amount !== null ? rupees(s.amount) : MODE_LABEL[s.mode]}</span>
                </div>
                <p className="security-meta">
                  {s.amount !== null && <span>{MODE_LABEL[s.mode]}</span>}
                  {s.reference && <span>{s.reference}</span>}
                  {s.bank && <span>{s.bank}</span>}
                </p>
                {s.mode === 'BG' && s.validUntil && (
                  <p className={`security-expiry${s.status === 'SUBMITTED' && daysToDate(s.validUntil) <= 30 ? ' security-expiry-soon' : ''}`}>
                    Valid until {formatDate(s.validUntil)}
                    {s.status === 'SUBMITTED' && <> · {expiryLabel(s.validUntil)}</>}
                    {s.claimUntil && <> · claim until {formatDate(s.claimUntil)}</>}
                  </p>
                )}
                <div className="security-actions">
                  <label className="security-status">
                    <span className="visually-hidden">Status</span>
                    <select value={s.status} onChange={(e) => { void onStatus(s, e.target.value as SecurityStatus); }}>
                      {(Object.keys(STATUS_LABEL) as SecurityStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <button type="button" className="link-button" onClick={() => startEdit(s)}>Edit</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing !== null ? (
          <form className="security-form" onSubmit={onSubmit}>
            <div className="security-grid">
              <label className="field" htmlFor="sec-kind">What
                <select id="sec-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as SecurityKind)}>
                  {(Object.keys(KIND_LABEL) as SecurityKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="sec-mode">How
                <select id="sec-mode" value={form.mode} onChange={(e) => set('mode', e.target.value as SecurityMode)}>
                  {(Object.keys(MODE_LABEL) as SecurityMode[]).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}
                </select>
              </label>
              {!noMoney && (
                <label className="field" htmlFor="sec-amount">Amount (₹)
                  <input id="sec-amount" type="text" inputMode="decimal" placeholder="e.g. 127300" value={form.amount}
                    onChange={(e) => set('amount', e.target.value)} />
                </label>
              )}
              <label className="field" htmlFor="sec-status">Status
                <select id="sec-status" value={form.status} onChange={(e) => set('status', e.target.value as SecurityStatus)}>
                  {(Object.keys(STATUS_LABEL) as SecurityStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                </select>
              </label>
              {!noMoney && (
                <label className="field" htmlFor="sec-ref">{form.mode === 'ONLINE' ? 'Payment reference' : `${MODE_LABEL[form.mode]} number`}
                  <input id="sec-ref" type="text" maxLength={120} value={form.reference} onChange={(e) => set('reference', e.target.value)} />
                </label>
              )}
              {instrument && (
                <label className="field" htmlFor="sec-bank">Bank
                  <input id="sec-bank" type="text" maxLength={120} value={form.bank} onChange={(e) => set('bank', e.target.value)} />
                </label>
              )}
              {instrument && (
                <label className="field" htmlFor="sec-issued">Issued on
                  <input id="sec-issued" type="date" value={form.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} />
                </label>
              )}
              {(form.mode === 'BG' || form.mode === 'FDR') && (
                <label className="field" htmlFor="sec-valid">{form.mode === 'BG' ? 'Valid until' : 'Matures on'}
                  <input id="sec-valid" type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
                </label>
              )}
              {form.mode === 'BG' && (
                <label className="field" htmlFor="sec-claim">Claim period ends
                  <input id="sec-claim" type="date" value={form.claimUntil} onChange={(e) => set('claimUntil', e.target.value)} />
                </label>
              )}
            </div>
            <label className="field" htmlFor="sec-notes">Notes
              <textarea id="sec-notes" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                placeholder="e.g. MSE certificate attached for exemption" />
            </label>
            <div className="bid-actions">
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn-link" onClick={() => setEditing(null)}>Cancel</button>
              {editing !== 'new' && (
                <button type="button" className="link-button security-delete" onClick={() => { void onDelete(editing); }}>Delete</button>
              )}
            </div>
          </form>
        ) : (
          <button type="button" className="security-add" onClick={startNew}>+ Add EMD or guarantee</button>
        )}
        {error && <p role="alert" className="error-text">{error}</p>}
      </div>
    </Panel>
  );
}
