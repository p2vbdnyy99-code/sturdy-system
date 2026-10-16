# Plan: tender search across central, state and GeM lists, working links, and the features on the public site

**Task (founder's words, 15 Oct 2026):** "when i go to the cppp portal through
tendertez after clicking on a contract it shows invalid url on cppp page and
why so less contracts visible ... take the best features of both the
websites, segregated state-wise, government agency-wise, GEM contract-wise.
Simplify it. Do the best you can." And: "all these features ... you've not
shown it on the front page, even without logging in ... reflect it on the
website, the front page, ... the menu".

## What was found (probes from the sandbox, 15 Oct 2026)

- **Why links fail:** a CPPP `tendersfullview/...` link carries the session
  of whoever loaded the list (a hash plus a timestamp). Opened in any other
  browser it shows "Invalid Url.Please Check", and even in-session the page
  asks for a captcha. So no stored central or state link can work. GeM links
  (`gemtendersfullview/<hash>`) open without a session and point to the bid
  on bidplus.gem.gov.in.
- **Why so few:** the collector read only page 1. The lists page without a
  captcha (the captcha on the page belongs to its search box):
  - central `cpppdata`: 2,889 pages, about 28,900 active tenders (includes
    Ministry of Railways, MES, NTPC, CPWD, municipal bodies);
  - state `mmpdata`: 5,962 pages, about 59,600, with a State column;
  - GeM `gemdata`: 3,814 pages, about 38,100 bids, with organisation,
    department and product category.
  Page N is `<list>?url=<base64 of "<list>?page=N">`.
- **Not used:** IREPS (railways' own portal): robots.txt disallows all and
  search needs a captcha and OTP. Railway tenders still arrive via CPPP's
  central list. GePNIC "tenders by organisation" pages now need a captcha.
- **CPPP terms:** linking needs no permission (they ask to be told, and want
  pages opened in a new window). Reproducing material is allowed "after
  taking proper permission from the respective Organisation / Department",
  accurately and with the source "prominently acknowledged". So: credit the
  source on every list, open links in a new tab, and update the NIC draft to
  ask for permission (draft only). The founder decides before it goes live.
- **Size:** production database is 11 MB; ~130k rows at ~1 KB is ~150 MB.
  Closed tenders are kept 60 days, then deleted.

## Steps

| # | Step | Files | Output | Check (written before the work) |
|---|---|---|---|---|
| 1 | Schema | migration 0010: `public_tenders` gains `kind` (central/state/gem), `state`, `department`, `category`, `tender_id`; indexes for kind+closing, state, organisation; new `discovery_state` (list, next page, total pages, sweep start, last success, last error) | additive only | migration has no drops; table count and `truncateAll` updated (lesson 10) |
| 2 | Parsers | `discovery/cppp.js` | one parser for the three lists; last-page number; page URL builder; tender ID taken from the row (GePNIC ID or GeM bid number); central/state rows get no session link; GeM rows keep their stable link | tests on saved real pages: 10 rows each, fields right (state names, GeM department and category, IST dates), no `tendersfullview` URL stored, page URL round-trips |
| 3 | Portal links | `discovery/portals.js` | where a user can find a tender: GeM link; state GePNIC portal (only portals checked to load) or CPPP; central → CPPP search, always with the Tender ID to copy | unit test: each kind gives an https link on an allow-listed host; every state in the map answered 200 when checked |
| 4 | Collector | `discovery/collector.js` | one request at a time, a pause between requests (default 3 s, never under 2), identifies itself; fresh pass of the newest pages of central and state every 15 min; full sweep of all three lists with a saved cursor (survives restarts); backoff on errors or a missing table; deletes tenders closed over 60 days | tests with a fake network: fresh pass then sweep order, cursor saved and resumed, pause respected, backoff, retention, a captcha page stops the sweep |
| 5 | Public API | `routes/publicTenders.js` (no sign-in), `routes/feed.js` | `GET /bidpilot/public/tenders` (kind, state, organisation, status, search, page) and `/facets` (counts by kind, state, top organisations, open only, cached 5 min), rate-limited per IP; track dedupes by Tender ID | HTTP tests: works signed out, filters, limits, bad input 400, rate limit 429; track twice → one tender |
| 6 | Public page | `pages/Tenders.tsx`, `tenders/*` | `/tenders`: Central / States / GeM tabs, state and organisation filters with counts, status chips, search, list with closing badge, Tender ID copy, "Find on portal" (new tab), source credit, "Track" (sign-up when signed out); same view inside the app as the Tender feed | browser: signed out lists rows, each filter changes results, GeM link opens bidplus-backed page, no Invalid Url, phone width, no CSP errors; signed in Track works |
| 7 | Public site | `PublicLayout.tsx`, `Home.tsx`, new `pages/Features.tsx` | menu: Tenders, Features; home: live tender counts and a features section covering tender search, bid tracker, checklist, corrigendum check, client workspaces; Features page | browser: menu links on desktop and phone, sections present, no claims of features that don't exist |
| 8 | Docs + checks | architecture, operations, FAQ, privacy, CLAUDE.md, NIC draft | | `verify.sh` all green; privacy and FAQ match the code |

**Allowed changes:** discovery, feed and new public routes, migration 0010,
public pages and layout, the app's feed page, CSS, docs, tests, this run
folder, the NIC Gmail draft (draft only).

**Run limit:** this session. Stop before commit. Production collector
settings change only with the deploy approval.
