// The dashboard's first-run panel, shown while a company has no tenders
// (firstRun.ts isFirstRun) in place of the empty counts and list. It says
// what to upload, what happens next and what it uses, and where to look if
// something fails. Numbers come from the server's summary; no processing time
// is promised (it depends on the document).
import { Link } from 'react-router-dom';
import { Panel } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { CONTACT_EMAIL } from '../config/site';

export function FirstRunPanel({ onUpload, uploading, notice, maxMb, autoAnalyze }: {
  onUpload: () => void;
  uploading: boolean;
  /** The upload notice (firstRun.ts uploadNotice), or null while unknown. */
  notice: string | null;
  maxMb: number | null;
  autoAnalyze: boolean;
}) {
  return (
    <Panel id="first-run" icon="upload" title="Analyse your first tender">
      <div className="card first-run">
        <p className="first-run-lead">
          Upload the PDF of a government or PSU tender, from CPPP, GeM or a state e-procurement portal. TenderTez lists
          its deadline, EMD, eligibility conditions, documents to submit and risky clauses, each with the page it came from.
        </p>
        <ol className="first-run-steps">
          <li>
            <strong>Upload the tender PDF.</strong>{' '}
            {maxMb ? `Up to ${maxMb} MB. ` : ''}The original file from the portal works best; scanned pages take longer to read.
          </li>
          <li>
            <strong>TenderTez reads every page.</strong> How long it takes depends on the length of the document.
          </li>
          <li>
            <strong>{autoAnalyze ? 'The analysis starts by itself.' : 'Click Analyze.'}</strong>{' '}
            The results appear on the tender&rsquo;s page, saved in your account, so you can leave this page meanwhile.
          </li>
        </ol>
        {notice && <p className="muted first-run-notice">{notice}</p>}
        <div className="first-run-actions">
          <button type="button" className="btn-primary btn-large" onClick={onUpload} disabled={uploading}>
            <Icon name="upload" />
            {uploading ? 'Uploading…' : 'Upload your first tender'}
          </button>
          <Link to="/sample-analysis">See a real analysis first <Icon name="arrowRight" /></Link>
        </div>
        <p className="muted first-run-help">
          If a PDF can&rsquo;t be read, upload it again, ideally the original file from the portal. If an analysis
          doesn&rsquo;t finish, open the tender and click Retry analysis; a retry doesn&rsquo;t use another tender.
          {CONTACT_EMAIL && <> Still stuck? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>}
        </p>
      </div>
    </Panel>
  );
}
