// Tells the server which page was shown, for the site's own visit counts
// (backend/src/bidpilot/visits.js). No cookie and nothing about the person:
// the page path, the site the visitor arrived from, and utm_source from the
// landing URL. Fire-and-forget: a failure here never affects the page.
// Plain fetch rather than request(): no CSRF token, no JSON response, and a
// 401 here must not be treated as a session expiry.

// Captured once, from the page the visitor landed on.
const landingReferrer = typeof document !== 'undefined' ? document.referrer : '';
const landingUtm = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('utm_source') ?? ''
  : '';

export function recordVisit(path: string) {
  try {
    void fetch('/bidpilot/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, referrer: landingReferrer, utm: landingUtm }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Counting a visit must never break the page.
  }
}
