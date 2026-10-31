import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { updateTracking, type TenderDetail, type TenderStatus } from '../api/tenders';
import { Panel } from '../components/AppShell';
import { useShellData } from '../shell/ShellData';
import { STAGES } from './stages';
import { listClients, type Client } from '../api/clients';
import { Link } from 'react-router-dom';

// Rendered with key={tender.id}, so opening another tender starts fresh.
// "Your bid": the bid tracker for one tender — stage, your own deadline,
// notes, and where the tender is on the government portal. Everything here
// is the user's own information, never read from the document.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function BidPanel({ tender, companyId, onSaved }: {
  tender: TenderDetail;
  companyId: string;
  onSaved: (patch: Partial<TenderDetail>) => void;
}) {
  const shell = useShellData();
  const [status, setStatus] = useState<TenderStatus>(tender.status);
  const [deadline, setDeadline] = useState(toDateInput(tender.internalDeadline));
  const [portalUrl, setPortalUrl] = useState(tender.portalUrl ?? '');
  const [portalRef, setPortalRef] = useState(tender.portalRef ?? '');
  const [notes, setNotes] = useState(tender.notes ?? '');
  const [clientId, setClientId] = useState(tender.clientId ?? '');
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    listClients(companyId).then((r) => setClients(r.clients)).catch(() => setClients([]));
  }, [companyId]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateTracking(tender.id, companyId, {
        status,
        // End of the chosen day in India, so "the 20th" means the whole 20th.
        internalDeadline: deadline ? new Date(`${deadline}T23:59:00+05:30`).toISOString() : null,
        portalUrl: portalUrl.trim() || null,
        portalRef: portalRef.trim() || null,
        notes: notes.trim() || null,
        clientId: clientId || null,
      });
      onSaved(saved);
      setMessage({ ok: true, text: 'Saved.' });
      shell.reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel id="your-bid" title="Your bid" aside={<span className="muted">Only you and your team see this</span>}>
      <form className="card bid-form" onSubmit={onSubmit}>
        <label className="field" htmlFor="bid-stage">Stage
          <select id="bid-stage" value={status} onChange={(e) => setStatus(e.target.value as TenderStatus)}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        {(clients.length > 0 || tender.clientId) && (
          <label className="field" htmlFor="bid-client">For
            <select id="bid-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Our own company</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="field-hint">Eligibility is checked against this {clientId ? 'client\u2019s' : 'company\u2019s'} profile.</span>
          </label>
        )}
        {clients.length === 0 && !tender.clientId && (
          <p className="field-hint bid-client-hint">Bidding for a client? <Link to="/clients">Add your clients</Link>.</p>
        )}
        <label className="field" htmlFor="bid-deadline">Your internal deadline
          <input id="bid-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="field" htmlFor="bid-portal-ref">Tender ID on the portal
          <input id="bid-portal-ref" type="text" maxLength={120} placeholder="e.g. 2026_PWD_123456_1" value={portalRef}
            onChange={(e) => setPortalRef(e.target.value)} />
        </label>
        <label className="field" htmlFor="bid-portal-url">Portal link
          <input id="bid-portal-url" type="url" maxLength={600} placeholder="https://eprocure.gov.in/…" value={portalUrl}
            onChange={(e) => setPortalUrl(e.target.value)} />
        </label>
        <label className="field bid-notes" htmlFor="bid-notes">Notes
          <textarea id="bid-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Ask the client for the CA certificate by Friday" />
        </label>
        <div className="bid-actions">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {tender.portalUrl && (
            <a href={tender.portalUrl} target="_blank" rel="noopener noreferrer" className="btn-link">Open on the portal ↗</a>
          )}
          {message && <span role={message.ok ? 'status' : 'alert'} className={message.ok ? 'save-confirmation' : 'error-text'}>{message.text}</span>}
        </div>
      </form>
    </Panel>
  );
}
