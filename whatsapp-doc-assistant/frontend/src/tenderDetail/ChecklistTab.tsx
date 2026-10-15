import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  addChecklistItem, checklistXlsxUrl, deleteChecklistItem, getChecklist, setChecklistItem, setCustomChecklistItem,
  type Checklist,
} from '../api/tenders';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';

// The submission checklist: one line per condition the analysis found (its
// requirements, documents first), plus your own items. Tick what is ready.
// Built from the tender every time, so nothing here is invented.
const CATEGORY_LABELS: Record<string, string> = {
  DOCUMENT: 'Documents', FINANCIAL: 'Financial', EXPERIENCE: 'Experience', CERTIFICATION: 'Certifications',
  LICENSE: 'Licences', LEGAL: 'Legal', TECHNICAL: 'Technical', MANPOWER: 'Manpower', EQUIPMENT: 'Equipment',
  OEM: 'OEM', GEOGRAPHIC: 'Location', SPECIAL_CONDITION: 'Special conditions', OTHER: 'Other',
};

export function ChecklistTab({ tenderId, companyId, analysed }: { tenderId: string; companyId: string; analysed: boolean }) {
  const [list, setList] = useState<Checklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setList(await getChecklist(tenderId, companyId)); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the checklist.');
    }
  }, [tenderId, companyId]);

  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<Checklist>) {
    setBusy(true);
    setError(null);
    try { setList(await action()); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
      load(); // put the list back as the server has it
    } finally { setBusy(false); }
  }

  /** Show a tick at once, then save it (run() restores the list on error). */
  function toggle(match: (id: string) => boolean, done: boolean, save: () => Promise<Checklist>) {
    setList((l) => {
      if (!l) return l;
      const items = l.items.map((i) => (match(i.key) ? { ...i, done } : i));
      const custom = l.custom.map((c) => (match(c.id) ? { ...c, done } : c));
      return { ...l, items, custom, done: items.filter((i) => i.done).length + custom.filter((c) => c.done).length };
    });
    run(save);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    await run(() => addChecklistItem(tenderId, companyId, label));
    setNewItem('');
  }

  if (!list && !error) return <p className="muted">Loading checklist…</p>;
  if (!list) return <p role="alert" className="error-text">{error} <button type="button" onClick={load}>Retry</button></p>;

  const groups = new Map<string, typeof list.items>();
  for (const item of list.items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);

  return (
    <div className="checklist">
      <div className="checklist-head">
        <div>
          <p className="checklist-progress-text"><strong>{list.done}</strong> of {list.total} ready</p>
          <progress className="checklist-progress" max={Math.max(1, list.total)} value={list.done} aria-label="Checklist progress" />
        </div>
        {list.total > 0 && (
          <a className="btn-pill checklist-download" href={checklistXlsxUrl(tenderId, companyId)} download>
            <Icon name="file" />Download as Excel
          </a>
        )}
      </div>
      {error && <p role="alert" className="error-text">{error}</p>}

      {list.items.length === 0 && (
        <EmptyState
          title={analysed ? 'No conditions were found in this tender' : 'Analyse the tender to build its checklist'}
          message={analysed ? 'You can still add your own items below.' : 'The checklist lists every condition the analysis finds, with its page.'}
        />
      )}

      {[...groups.entries()].map(([category, items]) => (
        <section key={category} className="checklist-group" aria-label={CATEGORY_LABELS[category] ?? category}>
          <h3 className="checklist-group-title">{CATEGORY_LABELS[category] ?? category}</h3>
          <ul className="checklist-list">
            {items.map((item) => (
              <li key={item.key} className={`checklist-item${item.done ? ' checklist-item-done' : ''}`}>
                <label className="checklist-check">
                  <input type="checkbox" checked={item.done}
                    onChange={(e) => toggle((k) => k === item.key, e.target.checked, () => setChecklistItem(tenderId, companyId, item.key, e.target.checked))} />
                  <span className="checklist-text">
                    <span className="checklist-label">{item.label}</span>
                    {item.detail && <span className="checklist-detail">{item.detail}</span>}
                  </span>
                </label>
                <span className="checklist-meta">
                  {!item.mandatory && <span className="badge badge-neutral">Optional</span>}
                  {item.sourcePage != null && <span className="checklist-page">p.{item.sourcePage}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="checklist-group" aria-label="Your items">
        <h3 className="checklist-group-title">Your items</h3>
        {list.custom.length > 0 && (
          <ul className="checklist-list">
            {list.custom.map((c) => (
              <li key={c.id} className={`checklist-item${c.done ? ' checklist-item-done' : ''}`}>
                <label className="checklist-check">
                  <input type="checkbox" checked={c.done}
                    onChange={(e) => toggle((k) => k === c.id, e.target.checked, () => setCustomChecklistItem(tenderId, companyId, c.id, e.target.checked))} />
                  <span className="checklist-text"><span className="checklist-label">{c.label}</span></span>
                </label>
                <button type="button" className="link-button" disabled={busy} aria-label={`Remove ${c.label}`}
                  onClick={() => run(() => deleteChecklistItem(tenderId, companyId, c.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form className="checklist-add" onSubmit={onAdd}>
          <label className="visually-hidden" htmlFor="checklist-new">Add an item</label>
          <input id="checklist-new" type="text" maxLength={300} placeholder="Add an item, e.g. Courier the EMD demand draft"
            value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit" disabled={busy || !newItem.trim()}>Add</button>
        </form>
      </section>
      <p className="muted checklist-foot">Built from the tender document. Check the original before you submit.</p>
    </div>
  );
}
