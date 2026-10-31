# Plan: bid workflow features, and the question of tender discovery

**Task (user's words):** "integrate best features of tendersontime and
tenderjunction". After the comparison, the founder chose: bid tracker,
document checklist, client workspaces, corrigendum check, and "All the past/
live/ future government tenders available and their status".

**What the two sites offer** (their own published pages; both block
automated visitors, so nothing was read directly): tender discovery across
thousands of portals with daily alerts; corrigendum tracking; shortlisting by
business profile; past awards and competitor analysis; staff-run bid
preparation, submission, pre-bid and EMD-refund help; GeM registration. No
published prices.

**Already in TenderTez:** `tenders.status` holds bid stages (NEW, REVIEWING,
INTERESTED, PREPARING_BID, SUBMITTED, AWARDED, NOT_AWARDED, CLOSED) with no
UI to change them; requirements carry a category (including DOCUMENT); an
XLSX engine exists (Papyr); an unused `compliance_items` table.

The work is split into phases, each its own run with its own approval. This
run builds phase 1 only.

## Phase 1 (this run): bid tracker + submission checklist

| # | Step | Files | Output | Check (written before the work) |
|---|---|---|---|---|
| 1 | Schema | migration 0009: `tenders.internal_deadline` (timestamptz), `tenders.notes` (text, ≤ 2,000 chars); new `checklist_items` (tender, label, source requirement text key, page, done_at, done_by) | additive only | migration reviewed (no drops); table count and `truncateAll` updated (lesson 10) |
| 2 | Tracker API | `routes/tenders.js`, repo | `PATCH /tenders/:id` for stage, internal deadline and notes; company-scoped; activity event on stage change | HTTP tests: each stage accepted, a bad stage 400, another company's tender 404, notes length limit, event written |
| 3 | Checklist API | new `repo/checklist.js`, routes | `GET /tenders/:id/checklist` built from the analysis: every DOCUMENT requirement, plus mandatory requirements that name a certificate, licence or proof; tick and untick; add your own item; ticks survive a re-analysis (matched by requirement text) | tests: built only from extracted requirements (nothing invented); tick/untick; custom item; re-analysis keeps ticks for unchanged items and drops removed ones; company isolation |
| 4 | Excel download | uses the existing XLSX engine | `GET /tenders/:id/checklist.xlsx`: item, page, done or not, plus tender name, number and deadline | test: the workbook opens and its rows equal the checklist |
| 5 | UI | tender page, dashboard, queue | stage picker and internal deadline on the tender page; a "Checklist" tab with ticks, progress ("7 of 12 ready"), add item, download; stage chips and a stage filter on the dashboard and in the queue | browser: change stage, see it in the table and queue; tick items, reload, ticks kept; download works; phone width; no CSP errors |
| 6 | Docs + checks | architecture, FAQ, privacy (notes are new user data) | | `verify.sh` all green; privacy names notes and checklist ticks |

## Phase 2: corrigendum check (next run)
Upload an amendment PDF to an existing tender; analyse it; show what changed
in deadline, EMD, value, dates and conditions, with pages; let the user
apply the new deadline. Needs care: corrigenda are often 1–2 pages.

## Phase 3: client workspaces (needs a pricing decision first)
Several client profiles under one consultant account, a client switcher, and
eligibility against the chosen client. **Decision for the founder:** does a
plan's tender allowance cover all clients together (simplest for
consultants) or each client separately? Best asked of Santosh first.

## Phase 4: tender discovery (needs a data decision before any build)
"All past, live and future tenders and their status" is the core business of
TendersOnTime and TenderJunction. What was found:
- **No official public API** was found for CPPP (eprocure.gov.in) or GeM.
  CPPP's newsletter mentions XML publishing of tender metadata; its help
  desk is support-eproc@nic.in. eprocure.gov.in has no robots.txt and its
  public "latest active tenders" page redirected rather than loading.
  GeM's bid lists are public web pages, not an API.
- **Commercial scrapers exist** (e.g. listings on Apify) that cover CPPP,
  GeM and state portals; they cost money, depend on unofficial routes, and
  pass their legal risk on to the user.
- **"Future" tenders** are generally not published before the notice; only
  some departments publish annual procurement plans.
- **Past tenders and their status** (results, awards) are on CPPP and GeM
  result pages, behind the same data-access question.

Options, for the founder to choose before anything is built:
1. **Ask NIC for official access** (email support-eproc@nic.in about the XML
   feed). Free and legitimate; slow and uncertain. Draft first, send only
   with approval.
2. **Try a paid data feed** for a limited period to measure coverage and
   quality. Costs money, so it needs approval and a budget.
3. **Build our own crawler** of the public pages. Not recommended: no
   documented permission, captchas, GeM reportedly needs an Indian proxy,
   and it is fragile.
4. **Lightweight now:** let users paste a CPPP/GeM tender link or ID and
   keep its status (open, closing, closed) in the tracker from the dates
   already extracted. No external data needed.

**Allowed changes (phase 1):** backend tender routes, a new repo, migration
0009, frontend tender page, dashboard, queue, CSS, docs, tests, this run
folder.

**Run limit:** this session. Stop before commit.

## Decisions during the run (founder: "Do all the phases"; tender data:
light version, ask NIC, build our own crawler)

- Client workspaces share the company's one plan (no pricing change). To be
  confirmed with a paying consultant.
- The crawler reads only CPPP's public latest-tenders page, which shows the
  newest 10 without a captcha; search and paging need a captcha and are not
  attempted. GeM is not collected (reportedly needs an Indian residential
  proxy, which we won't use). The collector is off until switched on.
- A tracked tender has no document until the user attaches it; it can't be
  analysed and doesn't count as a profile "try" until then.
- Company setup is unchanged.
