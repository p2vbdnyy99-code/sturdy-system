import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../api/auth';
import { useSession } from '../auth/SessionProvider';
import { ShellDataProvider, useOptionalShellData } from '../shell/ShellData';
import { PRODUCT_NAME } from '../config/product';
import { LogoMark } from './Logo';
import { Icon } from './Icon';
import { TenderQueue } from './TenderQueue';
import { ProfileRequiredDialog } from './ProfileRequiredDialog';

// The signed-in app's frame (a layout route, see routes.tsx): an icon rail,
// the tender queue panel and the page. It stays mounted while the user moves
// between pages, so the queue keeps its tab and search. On phones the rail
// becomes a top bar and the queue opens as a drawer. It also holds the
// "complete your company profile" dialog, which any page can open.
export function AppShell() {
  const { me, selectedCompanyId, clear } = useSession();
  const navigate = useNavigate();
  const [queueOpen, setQueueOpen] = useState(false);
  const activeTenderId = useMatch('/tenders/:id')?.params.id;

  async function onLogout() {
    try {
      await apiLogout();
    } finally {
      // Clear local state regardless of whether the network call succeeded —
      // an already-expired session shouldn't trap the user on a dead page.
      clear();
      navigate('/login', { replace: true });
    }
  }

  const identity = me ? (me.email ?? me.phone ?? me.name ?? '') : '';
  const initial = ((me?.name || me?.email || me?.phone || '?').replace(/^\+/, '')[0] ?? '?').toUpperCase();

  const body = (
    <div className={`shell${queueOpen ? ' shell-queue-open' : ''}`}>
      <nav className="shell-rail" aria-label="Main">
        <Link to="/dashboard" className="shell-rail-logo" aria-label={`${PRODUCT_NAME} dashboard`}>
          <LogoMark size={40} />
        </Link>
        <div className="shell-rail-links">
          <NavLink to="/dashboard" className="shell-rail-link" aria-label="Dashboard" title="Dashboard">
            <Icon name="grid" />
          </NavLink>
          <NavLink to="/company-profile" className="shell-rail-link" aria-label="Company profile" title="Company profile">
            <Icon name="briefcase" />
          </NavLink>
          <FeedRailLink />
          <NavLink to="/clients" className="shell-rail-link" aria-label="Clients" title="Clients">
            <Icon name="users" />
          </NavLink>
          <button
            type="button"
            className="shell-rail-link shell-queue-toggle"
            aria-expanded={queueOpen}
            aria-controls="shell-queue"
            onClick={() => setQueueOpen((o) => !o)}
          >
            <Icon name={queueOpen ? 'close' : 'inbox'} />
            <span className="shell-queue-toggle-label">Tenders</span>
          </button>
        </div>
        <div className="shell-rail-bottom">
          <button type="button" className="shell-rail-link" onClick={onLogout} aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
          <span className="shell-avatar" title={identity} aria-label={`Signed in as ${identity}`}>{initial}</span>
        </div>
      </nav>

      <aside id="shell-queue" className="shell-queue" aria-label="Your tenders">
        <TenderQueue activeTenderId={activeTenderId} onNavigate={() => setQueueOpen(false)} />
      </aside>

      <main className="shell-main"><Outlet /></main>
      {selectedCompanyId && <ProfileRequiredDialog />}
    </div>
  );

  // The provider needs a company; CompanyGate guarantees one on every page
  // that uses the shell.
  return selectedCompanyId ? <ShellDataProvider companyId={selectedCompanyId}>{body}</ShellDataProvider> : body;
}

/** The tender feed's rail link, with the number of new tenders for the
 *  company's saved searches (repo/savedSearches.js). */
function FeedRailLink() {
  const n = useOptionalShellData()?.summary?.newAlerts ?? 0;
  const label = n > 0 ? `Tender feed, ${n} new for your saved searches` : 'Tender feed';
  return (
    <NavLink to="/feed" className="shell-rail-link" aria-label={label} title={label}>
      <Icon name="globe" />
      {n > 0 && <span className="shell-rail-badge" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
    </NavLink>
  );
}

/** "Dashboard › iith": where the page sits, above its title. */
export function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A soft grey card with a header row, holding white content, as in the reference design. */
export function Panel({ title, icon, aside, children, className = '', id }: {
  title: ReactNode;
  icon?: Parameters<typeof Icon>[0]['name'];
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} className={`panel ${className}`.trim()} aria-labelledby={headingId}>
      <header className="panel-head">
        <h2 className="panel-title" id={headingId}>{icon && <Icon name={icon} />}{title}</h2>
        {aside && <div className="panel-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
