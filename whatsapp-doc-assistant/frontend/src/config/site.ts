// Facts shown on the public pages that only the founder can supply. Left
// empty, the pages simply leave them out (no placeholders, nothing invented):
// the About page uses the company voice and no contact email is shown.

/** Shown on FAQ, About and the footer when set, e.g. 'hello@tendertez.in'. */
export const CONTACT_EMAIL: string | null = 'advayaicopilot@gmail.com';

/** The founder's own note for the About page. */
export const FOUNDER: { name: string; city: string; story: string[] } | null = {
  name: 'Sayali Londhe',
  city: 'Mumbai',
  story: [
    'I started TenderTez because deciding whether to bid on a government tender shouldn’t mean a full day of reading first. The information is all there, but it’s scattered across a long document, and one missed condition can cost you the bid.',
    'TenderTez is early, and I read every piece of feedback myself. If something on a tender page looks wrong, or there’s a check you wish it did, write to me at advayaicopilot@gmail.com.',
  ],
};

/** Early-access free trial: how many tenders a new account gets free.
 *  Shown on the public pages. The server enforces its own number
 *  (BIDPILOT_TRIAL_TENDERS, default 5); keep the two the same. */
export const FREE_TRIAL_TENDERS = 5;

/** Monthly subscription plans shown on /pricing. The server enforces the
 *  same numbers (backend/src/bidpilot/plans.js); a backend test fails if they
 *  differ. Subscriptions are started by email until online payment exists. */
export const PLANS: Array<{ name: string; pricePerMonth: number; tendersPerMonth: number; forWho: string }> = [
  { name: 'Starter', pricePerMonth: 3999, tendersPerMonth: 10, forWho: 'Firms that bid a few times a month' },
  { name: 'Growth', pricePerMonth: 5999, tendersPerMonth: 15, forWho: 'Firms bidding every week' },
  { name: 'Pro', pricePerMonth: 8999, tendersPerMonth: 30, forWho: 'Busy firms and tender consultants' },
];
