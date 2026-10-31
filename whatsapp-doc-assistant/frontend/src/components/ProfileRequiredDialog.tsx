import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { getCompanyProfile } from '../api/companies';
import { useShellData } from '../shell/ShellData';
import { FREE_TENDERS_WITHOUT_PROFILE } from '../shell/profileGate';
import { PROFILE_FIELDS } from '../profileFields';
import { Icon } from './Icon';

// The "complete your profile" dialog. It opens when the company has used its
// free tenders without a profile and tries to add or analyse another (before
// the upload, or when the server answers 409 profile_incomplete). A native
// <dialog>, so focus, Escape and the backdrop behave as expected without any
// inline style.
export function ProfileRequiredDialog() {
  const { profile } = useShellData();
  const { selectedCompanyId } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDialogElement>(null);
  const [missing, setMissing] = useState<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (profile.dialogOpen && !dialog.open) dialog.showModal();
    if (!profile.dialogOpen && dialog.open) dialog.close();
  }, [profile.dialogOpen]);

  useEffect(() => {
    if (!profile.dialogOpen || !selectedCompanyId) return;
    let cancelled = false;
    getCompanyProfile(selectedCompanyId)
      .then((p) => { if (!cancelled) setMissing(p ? p.missing.length : PROFILE_FIELDS.length); })
      .catch(() => { if (!cancelled) setMissing(null); });
    return () => { cancelled = true; };
  }, [profile.dialogOpen, selectedCompanyId]);

  function goToProfile() {
    profile.closeDialog();
    navigate('/company-profile', { state: { from: pathname } });
  }

  return (
    <dialog ref={ref} className="modal" aria-labelledby="profile-dialog-title" onClose={profile.closeDialog}>
      <div className="modal-icon" aria-hidden="true"><Icon name="briefcase" /></div>
      <h2 id="profile-dialog-title" className="modal-title">Complete your company profile to continue</h2>
      <p>
        You&rsquo;ve added {FREE_TENDERS_WITHOUT_PROFILE} tenders without a company profile. From here on,
        TenderTez needs it: the eligibility check compares each tender&rsquo;s conditions with your company&rsquo;s
        details.
      </p>
      {missing !== null && missing > 0 && (
        <p className="modal-note">{missing} of {PROFILE_FIELDS.length} fields still to fill. Anything that doesn&rsquo;t apply can be answered &ldquo;None&rdquo;.</p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn-primary btn-large" onClick={goToProfile} autoFocus>
          <Icon name="arrowRight" />Fill in the profile
        </button>
        <button type="button" className="modal-secondary" onClick={profile.closeDialog}>Not now</button>
      </div>
    </dialog>
  );
}
