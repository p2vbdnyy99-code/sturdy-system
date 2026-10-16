import { useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '../api/client';
import { attachTenderDocument, type TenderDetail } from '../api/tenders';
import { Icon } from '../components/Icon';
import { useShellData } from '../shell/ShellData';

// A tender tracked from the feed has no document yet. Download it from the
// portal (TenderTez never downloads documents itself) and attach it here.
export function AttachDocumentNotice({ tender, companyId, onAttached }: {
  tender: TenderDetail; companyId: string; onAttached: () => void;
}) {
  const shell = useShellData();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await attachTenderDocument(tender.id, companyId, file);
      shell.reload();
      onAttached();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'profile_incomplete') shell.profile.openDialog();
      else setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notice notice-info attach-notice">
      <Icon name="info" />
      <span className="notice-text">
        <strong>Tracked from the tender feed.</strong> Download the tender document from the portal
        {tender.portalUrl && <> (<a href={tender.portalUrl} target="_blank" rel="noopener noreferrer">open it on CPPP ↗</a>)</>}, then
        attach the PDF here to analyse it.
        {error && <span role="alert" className="error-text"> {error}</span>}
      </span>
      <input ref={ref} type="file" accept="application/pdf" className="visually-hidden" onChange={onFile} />
      <button type="button" className="btn-primary notice-action" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="upload" />{busy ? 'Uploading…' : 'Attach the tender PDF'}
      </button>
    </div>
  );
}
