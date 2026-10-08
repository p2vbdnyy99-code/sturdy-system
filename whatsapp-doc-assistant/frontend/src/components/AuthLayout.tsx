import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS } from '../config/site';

// Shared frame for the signed-out pages (login, register, verify email) and
// the first-run steps (create/choose company): a navy brand panel beside the
// form card on desktop, collapsing to a compact banner on phones.
const POINTS = [
  'Deadline, EMD and eligibility pulled out in minutes',
  'Every answer links to the page it came from',
  'Risky clauses flagged before you bid',
];

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <Link to="/" className="auth-brand-logo" aria-label={`${PRODUCT_NAME} home`}>
          <Logo tone="light" />
        </Link>
        <div className="auth-brand-body">
          <p className="auth-brand-title">Tender intelligence for Indian contractors</p>
          <ul className="auth-brand-points">
            {POINTS.map((p) => (
              <li key={p}><Icon name="check" />{p}</li>
            ))}
          </ul>
        </div>
        <p className="auth-brand-note">Early access &middot; your first {FREE_TRIAL_TENDERS} tenders free</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
        {footer && <p className="auth-footer">{footer}</p>}
      </main>
    </div>
  );
}
