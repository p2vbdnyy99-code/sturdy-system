# TenderTez growth strategy (16 Oct 2026)

Goal: the first five paying customers, then automate only what demonstrably
converts. ₹0 ad spend. Every number below is measured, with its source; anything
not measured says so.

## 1. Audit of the real product

Checked in the repository and on the live site today.

| Area | What is true |
|---|---|
| Domains | `tendertez.in` is canonical. `www.tendertez.in`, `http://`, `tendertez.com` and `www.tendertez.com` all answer 301 to `https://tendertez.in/` (curl, 16 Oct). Both domains are in the founder's Hostinger account (expire Oct 2027). No DNS changes were made. |
| Product | Upload a tender PDF (CPPP, GeM, state portals). It extracts the deadline, EMD, eligibility conditions, BOQ and risky clauses, each with its page number; checks eligibility against the company profile; builds a submission checklist from the tender's own requirements; checks corrigenda; tracks bids (Excel export), EMDs and bank guarantees; drafts annexures as Word files; keeps a separate workspace per client (for consultants). Free public tender search from CPPP's public lists, with saved searches and in-app alerts. |
| Not in the product | No bid/no-bid verdict. Does not write or file the bid. No online payment. No email provider (no transactional email). |
| Accounts | Sign-up needed to analyse (email and password). Google and WhatsApp sign-in are built but hidden until their secrets are set. |
| Trial | First 5 tenders free, no card. Company profile optional for the first 2 tenders, then required. |
| Pricing | Starter ₹3,999/month (10 tenders), Growth ₹5,999 (15), Pro ₹8,999 (30). The highest published price in this market (`research/competitor-analysis.md`). |
| Payment | By hand: the user emails, the founder activates with `subscription.mjs`. Friction for a buyer who is ready. |
| Customers | 3 companies on the free trial; **0 paying** (`subscription.mjs status`, 16 Oct). |
| Funnel, last 30 days | 45 visitors → 4 saw sign-up → 3 signed up → 8 tenders uploaded → 4 analysed (`visits-report.mjs 30`; visit counting began 12 Oct). Sources: 39 direct, 5 Google, 2 Facebook, 1 X. 16 of 45 visitors on phones. |
| Analytics | Own cookie-free visit counter in Postgres + server-side GA4 (public pages only). No browser analytics script. |
| SEO | 52 sitemap URLs, all 200, canonical, unique titles; JSON-LD on home and pricing; `/llms.txt`; 46 landing pages for states and organisations with 20+ open tenders. Search Console property verified; sitemap not yet submitted. Details: `seo/technical-audit.md`. |
| Trust | Privacy policy matches the code. **No terms of service page.** Founder named on About. Contact by email only. |
| Lead capture | Sign-up and mailto links. No form, no sample report visible without signing up. |
| Outreach so far | Founder's Gmail: 12 consultancies and 5 associations emailed 6–9 Oct, follow-ups 15 Oct (recorded as "contacted before"). One consultancy replied no (building its own system); another signed up and analysed 1 tender. Explee has been emailing a "Tender Consultants" list since 14 Oct; content not visible here. |

## 2. The ten highest-priority opportunities

Ranked by likely effect on paid conversions, cheapest first.

1. **Talk to the consultancy that signed up after outreach, now.** The only prospect who used the product
   after outreach. A 15-minute call about their first analysis is the fastest
   path to customer 1 and to learning the real objection.
2. **Show the output before sign-up.** Visitors can't see what an analysis
   looks like without uploading. A public sample analysis of a real public
   tender (CPPP PDF, with page links) on the home page is the biggest CRO gap.
   Needs the founder's approval: it runs the AI once and publishes its output.
3. **Make paying easy.** "Email us to subscribe" loses buyers at the moment
   they decide. Online payment (Razorpay or similar; per-transaction fees,
   founder's decision) or at minimum a UPI/bank-transfer page with a same-day
   activation promise the founder can keep.
4. **Personalised outreach to verified consultancies, 5–10 a day.**
   Consultants read many tenders for many clients; client workspaces fit them.
   The CRM blocks repeats and opt-outs. Drafts are waiting in Gmail.
5. **Offer to run their live tender for them.** Lower effort than "sign up
   and try": "send me the PDF of a tender you are bidding on this week and I
   will send you the analysis". It converts reading into a demo.
6. **Educational posts that answer real bidder questions**, with sources
   (EMD exemptions, turnover clauses, MII classes, corrigenda). LinkedIn
   first, by hand, 3 a week. Each links to a relevant public page with UTMs.
7. **Submit the sitemap in Search Console** (one minute) so the 46 landing
   pages and the search page can be crawled from a sitemap Google knows about.
8. **Contractor and supplier prospects from public award notices.** CPPP's
   results of tenders list who won what. Firms that win tenders bid often;
   their own websites give public business contacts.
9. **Referral ask to every activated user**, and a partner offer to
   consultants (free client workspaces while they evaluate; founder's call).
10. **Price test with the first five.** At ₹3,999 for 10 tenders the price
    is the top objection in the simulated panel. A founder-approved launch
    price or a smaller plan for 3–5 tenders could be tested with real buyers.

## 3. Architecture (built)

```
founder ─ approves, sends, posts ─┐
                                  │
Claude Code session ──── skills (/marketing-daily, /find-prospects, ...)
   │                         │
   ├─ Tendertez Marketing MCP (stdio, .mcp.json) ─┐
   └─ CLI: python3 -m ttm ...  ───────────────────┤
                                                  ▼
                      ttm library: prospects (CRM, duplicates, opt-outs,
                      contacted-before), content (queue, claim checks, UTMs),
                      report, dashboard, seo_audit, safety (kill switch, dry run)
                                                  │
                      marketing/data/ (JSON + events.jsonl, git-ignored,
                      file-locked, atomic writes)  ── export → Google Drive
Website: tendertez.in visits (Postgres) + server-side GA4 → `ttm site-metrics`
Gmail connector: read sent/replies, create drafts (never sends on its own)
```

No new cloud services, no paid tools, no SQLite dependency (JSON is enough
at this volume and is easy to back up and read).

## 4. The first five changes (done today)

1. **Marketing workspace with CRM, content queue, approval flow, weekly
   report and dashboard** (`automation/`), 20 tests on mock data.
2. **Tendertez Marketing MCP server** with the nine tools, registered in
   `.mcp.json` and tested live in this session (including the claim guard).
3. **Real data in the CRM:** 19 earlier contacts imported from Gmail, 7 new
   prospects found and checked on the web, the two consultancies that responded recorded
   at their real stages, 2 personalised drafts waiting in Gmail.
4. **Live SEO audit script** and report; fixed long meta descriptions on
   landing pages (needs deploy).
5. **UTM convention the site can actually record**, applied automatically to
   every queued link. Since 16 Oct 2026 it is standard UTMs; the site stores
   `<source>.<campaign>` (`analytics/kpi-definitions.md`).

## 5. What only the founder can do

- Read and approve (or edit) the two outreach drafts in Gmail, then send them.
- Call or email the consultancy that signed up after outreach (`ttm prospects --stage activated`).
- Search Console: Sitemaps → add `https://tendertez.in/sitemap.xml` → Submit.
- Decide: public sample analysis (item 2), payment method (item 3), price test (item 10), terms of service.
- Check what Explee is sending against `brand-guide.md`; pause it if it makes claims we can't back.
- Optional: connect Typefully in claude.ai → Settings → Connectors (to schedule approved posts), and create a LinkedIn developer app (see `research/connector-matrix.md`).

## 6. Limits that can't be bypassed legitimately

- X has no free API for new developers; posts with links cost about $0.20 each. Manual posting instead.
- LinkedIn company-page posting needs LinkedIn's review; personal posting needs the founder's own sign-in.
- Google Business Profile: not eligible (online-only).
- GeM's site can't be reached from outside India and has no public API; IREPS forbids crawlers.
- Private groups, login-only directories, IndiaMART phone numbers and LinkedIn profiles are not scraped. IndiaMART rate-limits readers (HTTP 429 today), so those leads need checking by hand.
- Nothing proves deliverability or reply rates in advance; only sending shows them.
- The cloud session is temporary: `marketing/data/` must be exported to Drive after each session.
