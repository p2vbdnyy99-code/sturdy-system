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
 *  Shown on the public pages; not enforced in code yet (there is no paid
 *  plan to move to), so the promise is simply "at least this many free". */
export const FREE_TRIAL_TENDERS = 5;

/** Planned paid plans, shown on /pricing as "after your free trial". Nothing
 *  is billed today; change these freely before launch. */
export const PLANNED_PLANS: Array<{ name: string; pricePerMonth: number; tendersPerMonth: number; forWho: string }> = [
  { name: 'Starter', pricePerMonth: 499, tendersPerMonth: 5, forWho: 'Firms that bid now and then' },
  { name: 'Growth', pricePerMonth: 999, tendersPerMonth: 15, forWho: 'Firms bidding every week' },
  { name: 'Pro', pricePerMonth: 1999, tendersPerMonth: 40, forWho: 'Busy firms and tender consultants' },
];
