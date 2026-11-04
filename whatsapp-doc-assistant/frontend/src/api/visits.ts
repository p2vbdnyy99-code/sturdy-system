// Tells the server which page was shown, for the site's own visit counts
// (backend/src/bidpilot/visits.js). Nothing about the person: the page
// path, the site the visitor arrived from, and the campaign tag from the
// landing URL. The site's own cookies go with it only so the server can leave
// the TenderTez team's own visits out (backend staff.js); nothing from them
// is stored. Fire-and-forget: a failure here never affects the page.
// Plain fetch rather than request(): no CSRF token, no JSON response, and a
// 401 here must not be treated as a session expiry.

/** The campaign tag the server stores (page_views.campaign): utm_source,
 *  plus ".utm_campaign" when there is one, so a standard link
 *  ?utm_source=linkedin&utm_campaign=emd_exemption is counted as
 *  "linkedin.emd_exemption" (marketing/link-policy.md). */
export function campaignTag(search: string): string {
  const q = new URLSearchParams(search);
  const source = (q.get('utm_source') ?? '').trim();
  const campaign = (q.get('utm_campaign') ?? '').trim();
  if (!source) return '';
  return campaign && !source.includes('.') ? `${source}.${campaign}` : source;
}

// Captured once, from the page the visitor landed on.
const landingReferrer = typeof document !== 'undefined' ? document.referrer : '';
const landingUtm = typeof window !== 'undefined' ? campaignTag(window.location.search) : '';

/** A plan button was pressed (pricing's "Choose <plan>", or a plan "Contact
 *  us" in the app): counted as /plan-click/<plan> (backend visits.js), and
 *  sent on to Google Analytics as plan_click. The mailto still opens. */
export function recordPlanClick(plan: string) {
  const name = plan.toLowerCase();
  if (['starter', 'growth', 'pro', 'contact'].includes(name)) recordVisit(`/plan-click/${name}`);
}

export function recordVisit(path: string) {
  try {
    void fetch('/bidpilot/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, referrer: landingReferrer, utm: landingUtm }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Counting a visit must never break the page.
  }
}
