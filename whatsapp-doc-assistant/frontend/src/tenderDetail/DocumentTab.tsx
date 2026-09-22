import { useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { ApiError } from '../api/client';
import { getDocumentUrl, type TenderDetail } from '../api/tenders';

type DocumentTabProps = {
  tenderId: string;
  companyId: string;
  document: TenderDetail['document'];
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentTab({ tenderId, companyId, document: doc }: DocumentTabProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!doc) {
    return <EmptyState title="No document" />;
  }

  async function onDownloadClick() {
    setError(null);
    setDownloading(true);
    try {
      // Fetched fresh on every click, never cached — the URL is short-lived
      // and self-authorizing (see api/tenders.ts's getDocumentUrl doc comment).
      const { url } = await getDocumentUrl(tenderId, companyId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not get the document link.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <dl className="overview-list">
        <div className="overview-row">
          <dt>Filename</dt>
          <dd>{doc.filename}</dd>
        </div>
        <div className="overview-row">
          <dt>Type</dt>
          <dd>{doc.mimeType || '—'}</dd>
        </div>
        <div className="overview-row">
          <dt>Size</dt>
          <dd>{formatSize(doc.sizeBytes)}</dd>
        </div>
        <div className="overview-row">
          <dt>Uploaded</dt>
          <dd>{new Date(doc.uploadedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <button type="button" onClick={onDownloadClick} disabled={downloading} className="submit-button">
        {downloading ? 'Preparing download…' : 'Download'}
      </button>
      {error && <p role="alert" className="error-text">{error}</p>}
    </div>
  );
}
