import { PRODUCT_NAME } from '../config/product';

// Brand mark: a saffron tile holding a tender document with a navy check.
// Inline SVG (presentation attributes, not style="") so it passes the strict
// CSP. public/favicon.svg is the same mark; keep the two in sync.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#f5891f" />
      <path d="M10 6.5h8.6l4.9 4.9V24a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 24V8A1.5 1.5 0 0 1 10 6.5z" fill="#ffffff" />
      <path d="M18.6 6.5v4.9h4.9z" fill="#fcd9b1" />
      <path d="M11.5 14.5h8M11.5 18h5" stroke="#0b2545" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="22.5" cy="22.5" r="5.2" fill="#0b2545" />
      <path d="M20.2 22.6l1.6 1.6 3-3.2" fill="none" stroke="#f5891f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + wordmark. `tone="light"` for dark (navy) backgrounds. */
export function Logo({ tone = 'dark', size = 32 }: { tone?: 'dark' | 'light'; size?: number }) {
  // Wordmark split assumes PRODUCT_NAME ends in "lytic"; falls back to plain text otherwise.
  const split = PRODUCT_NAME.endsWith('lytic');
  return (
    <span className={`logo logo-${tone}`}>
      <LogoMark size={size} />
      <span className="logo-word">
        {split ? <>{PRODUCT_NAME.slice(0, -5)}<span className="logo-word-accent">lytic</span></> : PRODUCT_NAME}
      </span>
    </span>
  );
}
