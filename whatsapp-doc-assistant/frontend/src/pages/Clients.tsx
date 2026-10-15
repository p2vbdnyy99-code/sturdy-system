import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createClient, deleteClient, listClients, renameClient, type Client } from '../api/clients';
import { useSession } from '../auth/SessionProvider';
import { Breadcrumb, Panel } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PROFILE_FIELDS } from '../profileFields';

// Client workspaces: for tender consultants who bid for several firms. Each
// client has its own profile; mark a tender as being for a client (on the
// tender page) and its eligibility is checked against that client. All
// clients share your one plan.
export function ClientsPage() {
  const { selectedCompanyId } = useSession();
  const companyId = selectedCompanyId as string;
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try { setClients((await listClients(companyId)).clients); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your clients.');
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await action(); await load(); return true; } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
      return false;
    } finally { setBusy(false); }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await act(() => createClient(companyId, name.trim()))) setName('');
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!editing?.name.trim()) return;
    if (await act(() => renameClient(companyId, editing.id, editing.name.trim()))) setEditing(null);
  }

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Clients' }]} />
          <h1 className="page-title">Clients</h1>
          <p className="page-meta"><span>For consultants who bid for several firms</span><span>One plan covers all clients</span></p>
        </div>
      </header>
      <p className="muted">
        Add each firm you prepare bids for, fill in its profile, then on a tender choose who it is for. The
        eligibility check then compares that tender with the client&rsquo;s details instead of yours.
      </p>
      {error && <p role="alert" className="error-text">{error}</p>}

      <Panel id="clients" title="Your clients" aside={clients ? <span className="panel-count">{clients.length}</span> : undefined}>
        <div className="card">
          {!clients && !error && <p className="muted">Loading…</p>}
          {clients && clients.length === 0 && <EmptyState title="No clients yet" message="Add the first firm you bid for below." />}
          {clients && clients.length > 0 && (
            <ul className="client-list">
              {clients.map((c) => (
                <li key={c.id} className="client-row">
                  {editing?.id === c.id ? (
                    <form className="client-rename" onSubmit={onRename}>
                      <label className="visually-hidden" htmlFor={`rename-${c.id}`}>New name</label>
                      <input id={`rename-${c.id}`} type="text" maxLength={120} value={editing.name}
                        onChange={(e) => setEditing({ id: c.id, name: e.target.value })} autoFocus />
                      <button type="submit" className="btn-primary" disabled={busy}>Save</button>
                      <button type="button" className="link-button" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className="client-name">{c.name}</span>
                      <span className={c.profileComplete ? 'badge badge-success' : 'badge badge-warning'}>
                        {c.profileComplete ? 'Profile complete' : `${c.missingCount} of ${PROFILE_FIELDS.length} fields to fill`}
                      </span>
                      <span className="client-actions">
                        <Link to={`/clients/${c.id}/profile`} className="btn-pill"><Icon name="briefcase" />Profile</Link>
                        <button type="button" className="link-button" disabled={busy} onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</button>
                        <button type="button" className="link-button" disabled={busy}
                          onClick={() => { if (window.confirm(`Remove ${c.name}? Its tenders stay, as your own.`)) act(() => deleteClient(companyId, c.id)); }}>
                          Remove
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="checklist-add client-add" onSubmit={onAdd}>
            <label className="visually-hidden" htmlFor="new-client">Client name</label>
            <input id="new-client" type="text" maxLength={120} placeholder="Client firm's name, e.g. Patil Infra Pvt Ltd"
              value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>Add client</button>
          </form>
        </div>
      </Panel>
    </>
  );
}
