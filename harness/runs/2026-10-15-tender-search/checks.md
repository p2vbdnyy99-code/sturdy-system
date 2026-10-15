# Checks: tender search, working links, features on the public site

| step | requirement | verdict | evidence |
|---|---|---|---|
| probe | why CPPP links fail | pass | a `tendersfullview` link fetched with no CPPP session: "Invalid Url.Please Check"; in the same session the page asks for a captcha. Links carry the loader's session hash and a timestamp |
| probe | the lists page without a captcha | pass | page 2, 50, 500, 1500 of central and pages across the state list fetched with no captcha and parsed (10 rows each); last pages 2,889 / 5,962 / 3,814 |
| probe | GeM links work for anyone | pass | a stored `gemtendersfullview` link fetched with no session: 200, bid GEM/2026/B/7989716 details and its bidplus.gem.gov.in document link, no "Invalid Url", no captcha |
| probe | state portal links | pass | 29 state GePNIC portals answered 200 (Andaman and Andhra Pradesh didn't; they fall back to CPPP); the advanced search page with a Tender ID field opens directly (checked on Maharashtra and Kerala) |
| probe | not used | pass | IREPS: robots.txt `Disallow: /`, search needs captcha and OTP. GePNIC "tenders by organisation" now needs a captcha |
| 1 | migration 0010 is additive | pass | new `discovery_state`; 5 new nullable/defaulted columns and 3 indexes on `public_tenders`; one UPDATE that blanks the old session-bound links; no drops. Table count 31 and `truncateAll` updated (lesson 10) |
| 2 | parsers on saved real pages | pass | `feed.test.js`: central 10 rows (NTPC row field by field, IST dates, no stored link), state 10 rows with state names, GeM 3 rows (bid number, department, code-list category dropped, stable link); page URLs equal the portal's own pager links |
| 3 | every link is https on an allow-listed government host | pass | `feed.test.js` "portals": every fixture row; Kerala → etenders.kerala.gov.in search; unknown state → CPPP search |
| 4 | collector order, cursor, resume, retention, errors | pass | `feed.test.js` "collector": 6 fresh pages then central/state/gem in turn; cursor saved (central next page 3 of 4); a new crawler resumes at page 3; closed > 60 days deleted, 30 days kept; 403 and a captcha page throw, are recorded and the page is retried; every request carries the bot user agent |
| 4 | real run against CPPP | pass | 40 requests at 3 s spacing from the sandbox: 0 errors, 264 rows (95 central, 58 state, 111 GeM) |
| 5 | public API | pass | `feed.test.js` HTTP: signed out 200, newest first, kind/state/organisation/status/search filters, a literal `%`, 400 on a bad kind, paging, facets (open counts by list/state/organisation, closed ones not counted), 429 after 60 requests a minute |
| 5 | Track | pass | `feed.test.js`: once per tender ID (second call returns the same tender), portal_url = the state portal search, portal_ref = tender ID, no document, 409 `no_document` on analyse, no usage; another company 403; profile "try" rule unchanged |
| 6–7 | browser | pass | `tender-search-verify.mjs` 29/29 on real CPPP rows: menu items, live counts equal the database, 8 feature cards, GeM tab and link (new tab), state grid (11 states) and filter (Haryana, 22), organisation filter (MES, 22), central link + tender ID, Copy puts the ID on the clipboard, status from the URL, search, Track free → /register, features page (7 sections, anchor scroll), phone 375 px on 4 pages with no sideways scroll, phone menu, in-app feed with Track (bid number + GeM link stored), Track twice → same tender, no console or CSP errors |
| 6 | a bug found by the browser check | pass | after a tab change the previous list stayed on screen with no sign it was stale; the list now carries `aria-busy` (and dims) until the new rows arrive |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 593, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 373, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 303, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 1.04s |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| regression | earlier browser suites | pass | restyle 35/35, bid workflow 24/24 (its feed section moved to the new layout), optional profile 20/20. Two of my scripts read the page too early (a tab change, a new company's queue); they now wait for the list and the queue |
| 8 | docs | pass | architecture section; OPERATIONS collector settings and size; CLAUDE.md collector rule and lesson 18; privacy (tender search item, 60-day deletion, public); FAQ (where tenders come from, why links open the portal search) |
| 8 | NIC draft | pass | Gmail draft r-7595447107411388468 updated (permission to reproduce, links notice, how the lists are read, feed, award data); the founder's own wording kept; not sent |
| live | deploy, migration 0010, collector | unresolved | waiting for "commit and deploy" |
