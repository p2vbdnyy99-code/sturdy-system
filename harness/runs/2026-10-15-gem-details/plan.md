# Plan: "Bid details" button on GeM tenders

**Task (founder's words):** "Do option 2": next to "Find on GeM", a button
that opens CPPP's page for the GeM bid (bid number, dates, quantity, item,
buyer). Its PDF link is the broken doc_cppp one, so the page says nothing
about documents on our side beyond pointing to GeM.

**Known:** CPPP's `gemtendersfullview/<hash>` pages open for anyone with no
session (checked twice: 200, bid details shown, no "Invalid Url", no
captcha). The link is stored with each GeM row already.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | API | `discovery/portals.js`, `repo/publicTenders.js` | GeM rows get `details: { url, label: 'Bid details' }` when the stored link is a CPPP GeM page; other rows `details: null` | tests: GeM fixture rows → details on eprocure.gov.in `gemtendersfullview`; central/state → null; a non-CPPP stored link → null |
| 2 | UI | `tenders/TenderBrowser.tsx` | "Bid details ↗" (new tab) on GeM rows, after "Find on GeM"; tooltip says the PDF is on GeM | browser PC + phone: button on every GeM row, none on central/state, new tab, full width on phone, no sideways scroll, no CSP errors |
| 3 | Docs | architecture, FAQ, CLAUDE.md rule | | `verify.sh` green; live: a details link opened with no session shows the bid |

**Run limit:** this session. Stop before commit.
