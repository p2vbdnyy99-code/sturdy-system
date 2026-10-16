# Checks: Google Search Console and Google Analytics

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | /government-tenders and /features are indexable and in the sitemap | pass | `seo.test.js` new test; browser: both pages served without noindex, canonical and title present, both in `/sitemap.xml` |
| 1 | signed-in pages keep noindex | pass | `seo.test.js` (dashboard, tenders, login, profile, unknown); browser: `/dashboard` HTML has noindex |
| 1 | the visit counter names both pages | pass | `visits.test.js`: `/government-tenders?kind=gem` → `/government-tenders`, `/features` → `/features`; harness DB rows by name |
| 2 | forwarder off unless both settings are valid | pass | `ga4.test.js` settings: no secret, a UA- ID or no ID means off; config trims; startup log on the harness: "Google Analytics: public page views sent by the server to G-HARNESS123" |
| 2 | payload: page_view, client_id, session_id, engagement_time_msec, page_location, page_title, device.category; no IP, no user agent | pass | `ga4.test.js` deepEqual of the whole body; request body has no IP, ip_override, user_agent, Mozilla or user_id |
| 2 | only public pages are forwarded | pass | `ga4.test.js`: dashboard, tender, profile, login, verify-email, onboarding and (other) return null and make no request |
| 2 | failure or timeout never throws; secret never logged | pass | `ga4.test.js`: a thrown TypeError quoting the URL, a 403 and a 50 ms timeout each resolve false; no log line contains the secret or `api_secret`; 5 failures → 1 log line |
| 3 | /bidpilot/visit still answers 204 and records the row; forwards public pages once; never bots or signed-in pages | pass | `ga4.test.js` HTTP: 3 posts → 2 rows, 2 handed to the forwarder (no bot), 1 request to Google (`/features`, source google.com); a throwing forwarder → 204 and the row is recorded. Existing `visits.test.js` DB tests pass unchanged |
| 4 | Google's validation server accepts the payload | pass | real `https://www.google-analytics.com/debug/mp/collect` for our `/pricing` body: `validationMessages: []`; control payload with a bad event name: `NAME_INVALID` |
| 5 | privacy policy names Google Analytics and what it receives | pass | read against `ga4.js`: provider entry lists the pages and each field sent; no cookie, IP, account or signed-in pages; outside India; the visit-counts item and "What we don't do" updated; "no scripts from other companies" still true (CSP unchanged). `LAST_UPDATED` 16 October 2026, the go-live day (India) |
| 6 | browser: no request to another host on public pages; CSP unchanged | pass | `ga-verify.mjs` 14/14: every browser request to localhost:8790; 0 cookies on public pages; CSP header string identical; 4 public views at the stand-in in order with utm, linkedin.com, one session and client; login, dashboard and profile counted by the site (DB rows) but 0 sent; no CSP errors; secret absent from the server log (grep count 0) |
| 7 | docs and the founder's steps written | pass | BIDPILOT_ARCHITECTURE.md section; OPERATIONS.md Search Console + GA4 steps (append-only DNS); CLAUDE.md rule and lessons 20–21 |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 602, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 381, fail 0, skipped 22 |
| backend tests: no database | all backend tests pass | pass | pass 311, fail 0, skipped 34 |
| frontend build | type check and build succeed | pass | built in 731ms |
| frontend lint | lint exits 0 | pass | 15 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 47, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| live | Search Console verified, sitemap submitted | unresolved | needs the founder's Google account (OPERATIONS.md) |
| live | GA4 on in production | pass | the founder saved the values as `GA4` and `bidpilot`; with their go-ahead they were moved server to Fly (`secrets import`, values never shown) to `BIDPILOT_GA4_MEASUREMENT_ID` / `_API_SECRET` and the old two removed; nothing mid-analysis before the restart; log 18:53:59Z `Google Analytics: public page views sent by the server to G-ZD3C5VPFJ1`; a test visit to `/pricing?utm_source=setup-test` answered 204 and logged 0 `ga4:` warnings |
| live | GA4 Realtime shows the visit | unresolved | Google answers 2xx even to a wrong secret, so only the founder's Realtime report confirms it |
| live | nothing mid-analysis; deploy healthy | pass | `analyzing_now=0 migrations=11` (no migration in this change); `flyctl deploy` exit 0 (commit 11bfb61); log `Google Analytics: off (BIDPILOT_GA4_MEASUREMENT_ID / _API_SECRET not set)`, collector on |
| live | search pages and sitemap | pass | tendertez.in: `/government-tenders` and `/features` carry their canonical URL and no noindex, `/dashboard` noindex; sitemap lists 8 pages including both; CSP header identical |
| live | browser on tendertez.in (phone width) | pass | `ga-live.mjs` 6/6: privacy names Google Analytics and what it gets, dated 16 October 2026; tender search shows tenders; 0 cookies on public pages; every request to tendertez.in; no CSP errors |
