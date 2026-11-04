# Phase 1: measurement and technical improvements (4 Nov 2026)

Founder-approved Phase 1 of the Growth Engine (`TENDERTEZ_GROWTH_AUDIT.md`
§12). Small, independently testable stages. After each stage: relevant
tests, `verify.sh`, a browser check where users see it, and a report of
files, results and risks.

Not allowed: price changes, hosting migration, paid services, the anonymous
AI snapshot, payment architecture, schema changes, deploy, commit or push.

## Stage A: layout shift on the tender list pages

- **Problem.** On `/government-tenders/state|organisation|list/*`, mobile CLS
  is 0.31 (live, 4 Nov). The app replaces the server HTML, then:
  - first renders the page without the landing filter, count, facets or list;
  - looks them up (three requests);
  - inserts the count line and the list, pushing the source note, the call to
    action and the footer.
- **Fix.**
  - The server adds the landing page, the facets and the list's first page
    (the app's own default query for that list) to the HTML as a
    non-executed JSON block.
  - The app's first render uses them, so nothing arrives later.
  - The server-rendered list for crawlers (other lists, CPPP credit, "not
    every tender") is unchanged.
- **Files.**
  - Backend: `src/landingPages.js`, `server.js`, a shared JSON-block helper
    (also used by `samplePage.js`).
  - Frontend: `pages/GovernmentTenders.tsx`, `tenders/TenderBrowser.tsx`,
    new `tenders/landingData.ts`.
  - Tests.
- **Check.**
  - Unit/HTTP tests: the block is present and equals the API responses.
  - Lighthouse and a layout-shift trace at 390 px: CLS < 0.1 (was 0.31).
  - No extra requests on first load; filters, paging and in-app navigation
    still work.

## Stage B: founder activity out of visit analytics

- **Method:**
  1. A visit is not counted (no `page_views` row, nothing to GA4) when the
     request carries a valid session of an account in
     `BIDPILOT_ADMIN_EMAILS`.
  2. When an admin account signs in, the server sets a first-party,
     HttpOnly marker cookie (`bidpilot_staff`, 400 days). Visits carrying it
     are not counted even when signed out, so the founder's own browsers stay
     excluded.
  3. Signing out keeps the marker.
- **Files:**
  - backend `visits.js`, `routes/auth.js` (sign-in paths), `server.js`;
  - frontend `pages/Privacy.tsx` (the cookie);
  - tests.
- **Check:**
  - tests: admin session → not counted; admin marker → not counted;
    ordinary user and anonymous → counted;
  - a normal sign-in sets no marker, an admin sign-in (password and Google)
    does;
  - the cookie is HttpOnly, SameSite=Lax and Secure in production.

## Stage C: plan clicks and GA4 conversion events

- **Plan clicks:**
  - the pricing page's "Choose <plan>" buttons and the dashboard's "Contact
    us" plan buttons record `/plan-click/<starter|growth|pro|contact>` through
    the existing visit counter;
  - same mechanism as `/signed-up`, no schema change;
  - the mailto still opens.
- **GA4 events, server-side (Measurement Protocol, no browser tag):**

  | Event | When sent | Params |
  |---|---|---|
  | `sign_up` | at account creation (password, Google) | `method` |
  | `upload` | when a tender PDF is accepted | — |
  | `analysis_complete` | when an analysis completes | `automatic` |
  | `plan_click` | when a plan click is counted | `plan` |

  - Never for admin accounts.
  - No user, company or tender id, file name or content.
  - `client_id`: for request-bound events, the same daily anonymous id as
    page views (joins the day's session); for `analysis_complete`
    (background), a random id per event.
- **Files:**
  - backend `ga4.js`, `visits.js`, `routes/auth.js` and the Google sign-in
    path, the upload route, the analysis pipeline's completion, `server.js`;
  - frontend `Pricing.tsx`, the dashboard plan buttons, `Privacy.tsx`;
  - tests.
- **Check:**
  - unit tests of every event body (name, params, no ids);
  - route tests: each event fires once with a stub sender, never for admins,
    never blocks or fails the request;
  - browser: a plan click records the visit and still opens the mailto.

## Stage D: home page links to the guides

- **Change.** A short "Guides" section on the home page linking the three
  guides with one-line descriptions.
- **Files.** `pages/Home.tsx`, `index.css`.
- **Check.**
  - prerendered home HTML contains the three guide links;
  - no layout shift (CLS 0);
  - responsive at 360, 390, 768 and 1366 px.

## Close

- `BIDPILOT_ARCHITECTURE.md` section.
- `CLAUDE.md`: GA4 is no longer "public pages only"; it now also gets the
  four conversion events. Plus the founder-exclusion rule.
- `progress.md`.
- Handoff note in `marketing/data/handoff/`.
- Report `git diff --stat` and `git status`; stop.
