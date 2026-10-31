import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { annexureDocxUrl, draftAnnexure, listAnnexures, type AnnexureFormat } from '../api/tenders';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../format';

// The tender's own formats (Annexure, Form, Proforma pages; never a price
// bid or BOQ), each drafted as a Word file: the tender's wording with the
// bidder's details filled in from the company's (or client's) profile.
// Anything the profile doesn't hold is left "[to fill: …]"; nothing is
// guessed. See analysis/annexures.js.
export function AnnexuresTab({ tenderId, companyId, clientId, extracted }: {
  tenderId: string; companyId: string; clientId: string | null; extracted: boolean;
}) {
  const [data, setData] = useState<{ bidder: { name: string; isClient: boolean }; formats: AnnexureFormat[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ key: number; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listAnnexures(tenderId, companyId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the formats.');
    }
  }, [tenderId, companyId]);
  useEffect(() => { void load(); }, [load, clientId]);

  async function onDraft(f: AnnexureFormat) {
    setBusy(f.key);
    setError(null);
    setNotice(null);
    try {
      const r = await draftAnnexure(tenderId, companyId, f.key);
      setData((d) => (d ? { ...d, formats: d.formats.map((x) => (x.key === f.key ? { ...x, draft: r.draft } : x)) } : d));
      if (r.dropped > 0) {
        setNotice({ key: f.key, text: `${r.dropped} ${r.dropped === 1 ? 'line' : 'lines'} that didn’t match the tender’s wording ${r.dropped === 1 ? 'was' : 'were'} left out. Compare with the tender before you sign.` });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not draft this annexure.');
    } finally {
      setBusy(null);
    }
  }

  if (!extracted) return <EmptyState title="No document yet" message="Attach the tender PDF to find its annexures and forms." />;
  if (error && !data) return <p role="alert" className="error-text">{error}</p>;
  if (!data) return <p className="muted">Looking for formats…</p>;
  if (data.formats.length === 0) {
    return (
      <EmptyState title="No fill-in formats found"
        message="No page in this tender starts with an Annexure, Form or Proforma heading with blanks to fill. Price bids and BOQs are never drafted." />
    );
  }

  const profileLink = data.bidder.isClient && clientId ? `/clients/${clientId}/profile` : '/company-profile';
  return (
    <div className="annexures">
      <p className="muted annexures-intro">
        Drafts use the tender&rsquo;s own wording, filled in from {data.bidder.isClient ? <>{data.bidder.name}&rsquo;s</> : 'your company’s'}{' '}
        <Link to={profileLink}>profile</Link> (letterhead details included). Anything missing stays marked
        &ldquo;to fill&rdquo;. Check every line against the tender, print on letterhead and sign.
      </p>
      {error && <p role="alert" className="error-text">{error}</p>}
      <ul className="annexure-list">
        {data.formats.map((f) => (
          <li key={f.key} className="annexure-item">
            <div className="annexure-main">
              <span className="annexure-title">{f.title}</span>
              <span className="muted annexure-pages">
                {f.pages.length > 1 ? `Pages ${f.pages[0]}–${f.pages[f.pages.length - 1]}` : `Page ${f.pages[0]}`}
                {f.draft && <> · drafted {formatDate(f.draft.draftedAt)}</>}
              </span>
              {f.draft && f.draft.missing.length > 0 && (
                <span className="annexure-missing">
                  Not in the profile yet: {f.draft.missing.join(', ')}. <Link to={profileLink}>Add them</Link>, then download again.
                </span>
              )}
              {f.draft && <span className="muted annexure-blanks">{f.draft.blanks} {f.draft.blanks === 1 ? 'blank' : 'blanks'} only you can fill (such as the date)</span>}
              {notice?.key === f.key && <span role="status" className="annexure-notice">{notice.text}</span>}
            </div>
            <div className="annexure-actions">
              {f.draft && (
                <a className="btn-primary btn-link" href={annexureDocxUrl(tenderId, companyId, f.key)} download>Download Word</a>
              )}
              <button type="button" className={f.draft ? 'link-button' : 'btn-primary'} disabled={busy !== null} onClick={() => { void onDraft(f); }}>
                {busy === f.key ? 'Drafting…' : f.draft ? 'Draft again' : 'Draft'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
