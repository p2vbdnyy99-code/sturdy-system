// Where a user can open a tender from the feed. Government portals need a
// captcha to show a tender, and CPPP's own links only work inside the
// session that loaded its list, so for central and state tenders we link to
// the right portal's search page and show the tender id to search for.
// GeM bids have a stable public link (stored with the row).
//
// State portals: every URL below answered 200 with the NIC e-procurement
// system (GePNIC) when checked on 15 Oct 2026. A state that isn't listed (or
// didn't answer, like Andaman and Andhra Pradesh that day) falls back to
// CPPP's search. Keys are the state names as CPPP writes them, normalised.

const CPPP_SEARCH = 'https://eprocure.gov.in/cppp/tendersearch';
const SEARCH_PATH = '/nicgep/app?page=FrontEndAdvancedSearch&service=page';

const STATE_PORTALS = {
  'arunachal pradesh': 'arunachaltenders.gov.in',
  assam: 'assamtenders.gov.in',
  chandigarh: 'etenders.chd.nic.in',
  'dadra and nagar haveli and daman and diu': 'ddtenders.gov.in',
  delhi: 'govtprocurement.delhi.gov.in',
  goa: 'eprocure.goa.gov.in',
  haryana: 'etenders.hry.nic.in',
  'himachal pradesh': 'hptenders.gov.in',
  'jammu and kashmir': 'jktenders.gov.in',
  jharkhand: 'jharkhandtenders.gov.in',
  kerala: 'etenders.kerala.gov.in',
  ladakh: 'tenders.ladakh.gov.in',
  lakshadweep: 'tendersutl.gov.in',
  'madhya pradesh': 'mptenders.gov.in',
  maharashtra: 'mahatenders.gov.in',
  manipur: 'manipurtenders.gov.in',
  meghalaya: 'meghalayatenders.gov.in',
  mizoram: 'mizoramtenders.gov.in',
  nagaland: 'nagalandtenders.gov.in',
  odisha: 'tendersodisha.gov.in',
  puducherry: 'pudutenders.gov.in',
  punjab: 'eproc.punjab.gov.in',
  rajasthan: 'eproc.rajasthan.gov.in',
  sikkim: 'sikkimtender.gov.in',
  'tamil nadu': 'tntenders.gov.in',
  tripura: 'tripuratenders.gov.in',
  'uttar pradesh': 'etender.up.nic.in',
  uttarakhand: 'uktenders.gov.in',
  'west bengal': 'wbtenders.gov.in',
};

/** "NCT of Delhi" → "delhi", "Keralam" → "kerala", "Ladakh UT" → "ladakh". */
export function normaliseState(name) {
  return String(name ?? '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(nct of|ut|u\.t\.|union territory of|state of)\b/g, ' ')
    .replace(/\bkeralam\b/, 'kerala')
    .replace(/\borissa\b/, 'odisha')
    .replace(/\bpondicherry\b/, 'puducherry')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The host names links may point to (tests check every link against these). */
export const LINK_HOSTS = new Set(['eprocure.gov.in', ...Object.values(STATE_PORTALS)]);

/**
 * @returns {{ url: string, label: string, searchFor: string | null }}
 *   `searchFor` is the id to search for on that page (null when the link
 *   opens the tender itself).
 */
export function findOnPortal({ kind, state, tenderId, url }) {
  if (kind === 'gem' && url) return { url, label: 'Open on GeM-CPPP', searchFor: null };
  if (kind === 'state') {
    const host = STATE_PORTALS[normaliseState(state)];
    if (host) return { url: `https://${host}${SEARCH_PATH}`, label: `Search the ${state} e-tender portal`, searchFor: tenderId ?? null };
  }
  return { url: CPPP_SEARCH, label: 'Search on CPPP', searchFor: tenderId ?? null };
}
