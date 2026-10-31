# Plan: one path to a GeM bid's document

**Task (founder's words):** "GeM search shows but bid details open cppp and
then blank after that" → "Yes, remove it". GeM's search finds the bid; the
"Bid details" page (CPPP) loads (checked in a phone browser: still showing
the bid after 10 s), but its document link is the broken doc_cppp one.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Remove "Bid details" | `discovery/portals.js`, `repo/publicTenders.js`, `api/feed.ts`, `TenderBrowser.tsx`, tests | no `details` in rows, no button | tests: rows have no `details`; browser: no "Bid details" anywhere |
| 2 | Clear GeM instruction | `TenderBrowser.tsx` | after "Find on GeM": "Bid number copied. On GeM, paste it into the search box, open the bid and download the document." | browser PC + phone: the note shows after the tap, clipboard holds the bid number, GeM's list opens in a new tab |
| 3 | Docs | architecture, FAQ, CLAUDE.md rule | | `verify.sh` green |

**Run limit:** this session. Stop before commit.
