# Plan: Google Search Console and Google Analytics (15 Oct 2026)

**Task:** "integrate my website with google search console, analytics".

**Decisions (the founder, by AskUserQuestion):**
- Analytics: server-side GA4. The server forwards the visits it already counts to
  Google Analytics through the Measurement Protocol. No Google script in the
  browser, no cookie, the Content-Security-Policy stays the same, and only public
  pages are sent.
- Search Console: verify through a DNS record (a Domain property).

**Found before planning:**
- tendertez.in's DNS on Hostinger already has a TXT record
  `google-site-verification=egiyeIwf…` next to the SPF record. Someone has already
  started Search Console verification for the domain.
- Any DNS change must append (`overwrite: false`). `overwrite: true` would replace
  the SPF record, and email from Reach would fail.
- `/government-tenders` and `/features` are not in `PUBLIC_PAGES`. They are
  served with `noindex` and are missing from the sitemap, so Google is told not
  to index the tender search. The visit counter also files them under `(other)`.

**Allowed changes:**
- `backend/src/seo.js`
- `backend/src/bidpilot/visits.js`
- new `backend/src/bidpilot/ga4.js`
- `backend/src/config.js`
- `backend/server.js` (wiring only)
- backend tests
- `frontend/src/pages/Privacy.tsx`
- docs: BIDPILOT_ARCHITECTURE.md, OPERATIONS.md, CLAUDE.md, this run folder

Not allowed:
- the CSP header
- any new browser script
- DNS writes (only with approval)
- Fly secrets (only with approval)

**Run limit:** three attempts per failing check, then report.

## Steps

| # | step | files | output | check |
|---|---|---|---|---|
| 1 | Index the tender search and features pages | seo.js, visits.js, seo.test.js, visits.test.js | both pages in `PUBLIC_PAGES` (title, description, canonical, in the sitemap); visits counts them by name | seo tests: sitemap lists them; rendered HTML has no `noindex` for them and keeps it for `/dashboard`; `normalizePath('/features')` is `/features` |
| 2 | GA4 forwarder | new ga4.js, config.js, ga4.test.js, config test | `createGa4Forwarder`: off unless both `BIDPILOT_GA4_MEASUREMENT_ID` (`G-…`) and `BIDPILOT_GA4_API_SECRET` are set; sends `page_view` for public pages only | unit tests with a fake fetch: payload shape (`client_id`, `session_id`, `engagement_time_msec`, `page_location`, `page_title`, `device.category`, no IP or user agent), signed-in pages never sent, bad measurement ID means off, a failure or timeout never throws, the API secret never appears in a log line |
| 3 | Wire it into the visit counter | visits.js, server.js | `POST /bidpilot/visit` records the row as before and also forwards, never delaying or failing the 204 | HTTP test: a public page reaches the fake fetch once; `/dashboard` and bots never do; the 204 still arrives when the forwarder throws |
| 4 | Check the payload against Google's validation server | scratchpad script | the real `/debug/mp/collect` response for our payload | `validationMessages` is empty |
| 5 | Privacy policy matches the code | Privacy.tsx, seo.js (privacy description) | Google Analytics named as a provider: what is sent, no cookie, public pages only; "loads no scripts from other companies" kept; data outside India | read-through against ga4.js; `LAST_UPDATED` is the go-live day |
| 6 | Verify | verify.sh, a browser script | checks.md | verify.sh all pass; browser on the local harness: public pages make no request to any other host; the CSP header is unchanged; the features and tender pages have no `noindex`; the sitemap lists both |
| 7 | Docs and the founder's steps | BIDPILOT_ARCHITECTURE.md, OPERATIONS.md, CLAUDE.md, progress.md | architecture section; OPERATIONS: creating the GA4 property and API secret, the Fly secrets, Search Console Domain property, submitting the sitemap, the DNS rule (append only) | read-through |

**After approval only:**
- commit, deploy;
- `flyctl secrets set` for GA4 (the founder supplies the ID and secret);
- any DNS TXT record (only if Search Console asks for a new one).
