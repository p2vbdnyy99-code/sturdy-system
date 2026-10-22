# Plan: GeM bids open GeM's own bid search instead of a broken PDF link

**Task (founder's words):** "not working, not on windows oc/ iphone/ android"
→ "Do option 1": copy the bid number and open GeM's public bid list
(bidplus.gem.gov.in/all-bids), where GeM's own bid document link works.

**Why:** the `bidplus.gem.gov.in/doc_cppp/<token>` link that CPPP publishes
(and that "Bid document (PDF)" redirected to) fails on every device. GeM's
working document links use GeM's internal number, which only GeM's
India-only servers give out. bidplus can't be reached from the sandbox or
the Singapore server, so the bid search page can only be checked by the
founder.

## Steps

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Remove the broken redirect | `discovery/gemDocument.js` (deleted), `routes/publicTenders.js`, `repo/publicTenders.js`, fixture `gem-view.html` (deleted), tests | no `/document` route, no `documentUrl`; CPPP's GeM pages are never read again | `/public/tenders/:id/document` → 404; no `documentUrl` in rows; tests updated |
| 2 | GeM rows → GeM's bid search | `discovery/portals.js` | GeM `find` = `https://bidplus.gem.gov.in/all-bids`, label "Find on GeM", `searchFor` = bid number; bidplus added to the allowed link hosts | unit test: every GeM fixture row → all-bids with its bid number; every link https on an allowed host |
| 3 | One tap copies and opens | `tenders/TenderBrowser.tsx`, `index.css` | the portal button (all lists) copies the tender ID / bid number as it opens the portal in a new tab, and the row says "copied: paste it into the search box"; the PDF button and its phone hint are gone; phone layout kept | browser at 1440 and 375 px: GeM row button → all-bids in a new tab, clipboard holds the bid number, the row shows the copied note; central and state rows do the same with their IDs; no PDF button; no sideways scroll; no CSP errors |
| 4 | Docs | architecture, FAQ, OPERATIONS, CLAUDE.md (drop the exception, add lesson 19) | | `verify.sh` green; tender search suite rerun |

**Allowed changes:** the files above, this run folder.
**Run limit:** this session. Stop before commit.
