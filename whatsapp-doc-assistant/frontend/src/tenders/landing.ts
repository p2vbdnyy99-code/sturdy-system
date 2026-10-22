// Public landing pages for the tender search: one per state, per large
// central organisation, and for the central and GeM lists, at
// /government-tenders/<group>/<slug>. The server builds the same paths
// (backend/src/landingPages.js imports nothing from here, but its test
// checks both slug functions agree), renders each page's head tags and a
// crawlable list, and lists them in the sitemap.

/** Lists with fewer open tenders get no landing page (backend MIN_OPEN, tested). */
export const LANDING_MIN_OPEN = 20;

export type LandingFilter = { kind: 'central' | 'state' | 'gem' | 'all'; state: string; organisation: string };

/** "Jammu and Kashmir" -> "jammu-and-kashmir"; "E-IN-C BRANCH - MILITARY ..." -> "e-in-c-branch-military-...". */
export function landingSlug(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function statePath(state: string): string {
  return `/government-tenders/state/${landingSlug(state)}`;
}

export function organisationPath(organisation: string): string {
  return `/government-tenders/organisation/${landingSlug(organisation)}`;
}

export type LandingPage = { path: string; kind: 'central' | 'state' | 'gem'; state: string; organisation: string; label: string; count: number };
