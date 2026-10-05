import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider';
import { Logo } from './Logo';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL } from '../config/site';

// Header and footer for the public pages (home, pricing, FAQ, about). The
// phone menu is a <details> element: no script, so nothing for the CSP to
// object to, and it works with the keyboard out of the box.
const LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
  { to: '/about', label: 'About' },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const signedIn = status === 'authenticated';

  const accountLinks = signedIn ? (
    <Link to="/dashboard" className="btn-link btn-primary">Open dashboard</Link>
  ) : (
    <>
      <Link to="/login" className="home-nav-login">Log in</Link>
      <Link to="/register" className="btn-link btn-primary">Start free trial</Link>
    </>
  );

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-container home-nav-inner">
          <Link to="/" className="home-nav-brand" aria-label={`${PRODUCT_NAME} home`}><Logo /></Link>
          <nav className="home-nav-links" aria-label="Main">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to} className="home-nav-page">{l.label}</NavLink>)}
            {accountLinks}
          </nav>
          <details className="public-menu">
            <summary>Menu</summary>
            <nav className="public-menu-panel" aria-label="Main">
              {LINKS.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
              {accountLinks}
            </nav>
          </details>
        </div>
      </header>

      <main>{children}</main>

      <footer className="home-footer">
        <div className="home-container">
          <div className="public-footer-grid">
            <div className="public-footer-brand">
              <Logo size={26} />
              <p>Reads government tender documents so you can decide faster whether to bid.</p>
            </div>
            <div>
              <p className="public-footer-heading">Product</p>
              <Link to="/#how-it-works">How it works</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/faq">FAQ</Link>
            </div>
            <div>
              <p className="public-footer-heading">Company</p>
              <Link to="/about">About</Link>
              {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
            </div>
            <div>
              <p className="public-footer-heading">Account</p>
              <Link to="/login">Log in</Link>
              <Link to="/register">Start free trial</Link>
            </div>
          </div>
          <div className="public-footer-bottom">
            <p>AI can make mistakes. Always confirm important details on the source page before you bid.</p>
            <p>&copy; {new Date().getFullYear()} {PRODUCT_NAME}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Title band at the top of a public sub-page. */
export function PageIntro({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <section className="page-intro">
      <div className="home-container">
        <p className="home-kicker">{kicker}</p>
        <h1>{title}</h1>
        {children && <div className="page-intro-lead">{children}</div>}
      </div>
    </section>
  );
}
