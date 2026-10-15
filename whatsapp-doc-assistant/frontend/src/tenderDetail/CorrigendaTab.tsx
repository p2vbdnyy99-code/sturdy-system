import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '../api/client';
import {
  APPLICABLE_CORRIGENDUM_FIELDS, applyCorrigendum, listCorrigenda, uploadCorrigendum, type Corrigendum,
} from '../api/tenders';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { formatDate } from '../format';

// Corrigenda: upload an amendment to this tender and see what it changes,
// each change quoted from the corrigendum with its page. Deadline, EMD, fee,
// value, duration and opening date can then be written onto the tender.
export function CorrigendaTab({ tenderId, companyId, onApplied }: {
  tenderId: string; companyId: string; onApplied: () => void;
}) {
  const [list, setList] = useState<Corrigendum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setList((await listCorrigenda(tenderId, companyId)).corrigenda); } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load corrigenda.');
    }
  }, [tenderId, companyId]);

  useEffect(() => { load(); }, [load]);

  // Poll while one is being checked (a minute or two at most).
  const processing = list?.some((c) => c.status === 'PROCESSING');
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [processing, load]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadCorrigendum(tenderId, companyId, file);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="corrigenda">
      <div className="corrigenda-head">
        <p className="muted">
          Upload a corrigendum, addendum or extension notice for this tender. TenderTez compares it with the
          tender&rsquo;s key facts and shows what it changes, quoted from the corrigendum.
        </p>
        <input ref={fileRef} type="file" accept="application/pdf" className="visually-hidden" onChange={onFile} />
        <button type="button" className="btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />{uploading ? 'Uploading…' : 'Upload corrigendum'}
        </button>
      </div>
      {error && <p role="alert" className="error-text">{error}</p>}
      {list && list.length === 0 && <EmptyState title="No corrigenda yet" message="When the department amends this tender, upload the notice here." />}
      {/* Keyed on status too: the ticks start from the changes once the check finishes. */}
      {list?.map((c) => <CorrigendumCard key={`${c.id}-${c.status}`} c={c} tenderId={tenderId} companyId={companyId} onApplied={() => { load(); onApplied(); }} />)}
    </div>
  );
}

function CorrigendumCard({ c, tenderId, companyId, onApplied }: {
  c: Corrigendum; tenderId: string; companyId: string; onApplied: () => void;
}) {
  const applicable = c.changes.filter((ch) => APPLICABLE_CORRIGENDUM_FIELDS.includes(ch.field));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(applicable.map((ch) => ch.field)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await applyCorrigendum(tenderId, companyId, c.id, [...chosen]);
      setMessage({ ok: true, text: `Applied to the tender${r.skipped.length ? `. Not applied: ${r.skipped.join('; ')}` : '.'}` });
      onApplied();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not apply.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="corrigendum">
      <header className="corrigendum-head">
        <span className="corrigendum-name"><Icon name="file" />{c.filename}</span>
        <span className="muted">Uploaded {formatDate(c.createdAt)}{c.pageCount ? ` · ${c.pageCount} pages` : ''}</span>
      </header>
      {c.status === 'PROCESSING' && <p className="notice notice-info notice-progress"><span className="notice-spinner" aria-hidden="true" />Checking what this corrigendum changes…</p>}
      {c.status === 'FAILED' && <p role="alert" className="error-text">{c.error ?? 'The check failed.'}</p>}
      {c.status === 'COMPLETED' && (
        <>
          {c.summary && <p className="corrigendum-summary">{c.summary}</p>}
          {c.changes.length === 0 ? (
            <p className="muted">No changes to the tender&rsquo;s key facts or conditions were found in it.</p>
          ) : (
            <ul className="corrigendum-changes">
              {c.changes.map((ch, i) => {
                const canApply = APPLICABLE_CORRIGENDUM_FIELDS.includes(ch.field) && !c.appliedAt;
                return (
                  <li key={i} className="corrigendum-change">
                    {canApply ? (
                      <label className="checklist-check">
                        <input type="checkbox" checked={chosen.has(ch.field)}
                          onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(ch.field); else n.delete(ch.field); return n; })} />
                        <span className="checklist-label">{ch.label}</span>
                      </label>
                    ) : <span className="checklist-label">{ch.label}</span>}
                    <span className="corrigendum-values">
                      {ch.before && <><span className="corrigendum-before">{ch.before}</span><span aria-hidden="true">→</span></>}
                      <strong>{ch.after}</strong>
                      <span className="checklist-page">p.{ch.sourcePage}</span>
                    </span>
                    <q className="corrigendum-quote">{ch.evidenceText}</q>
                  </li>
                );
              })}
            </ul>
          )}
          {c.appliedAt && <p className="save-confirmation">Applied to the tender on {formatDate(c.appliedAt)}.</p>}
          {!c.appliedAt && applicable.length > 0 && (
            <div className="bid-actions">
              <button type="button" className="btn-primary" disabled={busy || chosen.size === 0} onClick={apply}>
                {busy ? 'Applying…' : 'Apply the ticked changes to the tender'}
              </button>
            </div>
          )}
          {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'save-confirmation' : 'error-text'}>{message.text}</p>}
        </>
      )}
    </article>
  );
}
