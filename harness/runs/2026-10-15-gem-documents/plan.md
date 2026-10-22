# Plan: GeM bid documents that open on phone and PC

**Task (founder's words):** "Once we go on to the cppp portal, we get few
details and bid documents but we can't see the bid documents a blank page
comes" … "Phone. Optimise it for both phone/ pc".

**Found:** the GeM row links to CPPP's GeM page, which shows a "Bid Document"
link to `bidplus.gem.gov.in/doc_cppp/<token>` (a plain link; the token was
the same on two fetches). bidplus resets connections from outside India
(sandbox and the Singapore server), so the PDF itself can't be fetched from
here. On Android, Chrome doesn't show PDFs in the browser: a PDF opened in a
new tab downloads in the background and leaves the tab blank, which matches
what the founder saw.

## Steps

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Document link on demand | `discovery/gemDocument.js`, `routes/publicTenders.js` | `GET /bidpilot/public/tenders/:id/document`: for a GeM row only, reads its CPPP GeM page once (only `https://eprocure.gov.in/cppp/gemtendersfullview/...`), takes the `bidplus.gem.gov.in/doc_cppp/` link, caches it 12 h, answers 302 to it; if no link is found, 302 to the GeM page; 404 for other rows; 20 a minute per IP. Never downloads the PDF | unit test on a saved real GeM page; HTTP tests with the network stubbed: redirect, cache (one fetch for two clicks), fallback, 404, bad id, rate limit, only the allowed host is fetched |
| 2 | Rows on phone and PC | `tenders/TenderBrowser.tsx`, `index.css` | GeM rows get "Bid document (PDF)": a new tab on a computer, the same tab on a touch phone (so Android shows its download prompt instead of a blank tab), with a one-line phone hint; "GeM bid page" stays as the second link. On phones the row's buttons stack full width with 44 px tap targets | browser at 1440 and 375 px: GeM button present with the right target on each; clicking it reaches the bidplus URL (network stubbed); central/state rows unchanged; no sideways scroll; buttons ≥ 44 px tall on the phone; no CSP errors |
| 3 | Docs + checks | architecture, FAQ, CLAUDE.md rule | | `verify.sh` green; earlier suites rerun |

**Allowed changes:** the public tenders route, a new discovery helper,
TenderBrowser and CSS, docs, tests, this run folder.
**Run limit:** this session. Stop before commit.
