# Test A: Organic search discoverability (document-to-spreadsheet SaaS)

Started 2026-10-22. Scope: 40 purchase-intent queries across 7 document categories. Raw dataset:
`data/2026-10-22/doc_saas/search_queries.py`. Summary: `search_summary.json`. Domain ages: `serp_domain_ages.csv`.

## Screening decision: **INCONCLUSIVE**

| Criterion | Result |
|---|---|
| Visibility screen | Passes |
| Adoption screen | Fails |
| Paid-demand screen | Borderline |

Smaller and newer specialists **do appear** in results, but only **one** has independently verifiable paying customers, and
its revenue is very small. Ranking evidence is not traffic evidence.

## Method and its limits

- **Engine:** the Claude Code `WebSearch` tool on 2026-10-22. It returns US results by its own ranking, with no device or location
  control. **It is not Google.**
- **What I can't measure:** with only public tools I cannot measure keyword difficulty, search volume, click share, traffic or
  conversion. **None of these numbers appears anywhere in this report.**
- **Result counting:** each query returned roughly 4–12 links. One business is counted once per query.
- **Result classes:**
  - E: established specialist, domain registered 2023 or earlier
  - N: newer or independent specialist
  - P: major platform
  - AI: general AI / AI-spreadsheet tool
  - I: informational content
  - D: directory or marketplace listing
  - S: spam or parasite pages on unrelated .gov/.edu/test hosts
  - O: other
- **Domain ages:** taken from RDAP via rdap.org, 2026-10-22. **A registration date is not a launch date.** A young domain does
  not prove a new product, and an old domain does not prove customers. Where a launch date could not be verified, it is recorded as unknown.
- **Not preserved:** the full SERP text. The classified dataset is the audit trail.

## Query list and classification

| # | Query | Category | Intent | E | N | P | AI | I | D | S | O |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | bank statement to excel converter | bank | T | 0 | 2 | 2 | 2 | 0 | 2 | 1 | 0 |
| 2 | convert pdf bank statement to csv | bank | T | 2 | 3 | 1 | 0 | 1 | 0 | 0 | 1 |
| 3 | bank statement converter for quickbooks | bank | T | 2 | 1 | 0 | 0 | 2 | 0 | 0 | 1 |
| 4 | pdf bank statement to qbo converter | bank | T | 2 | 1 | 0 | 0 | 0 | 1 | 0 | 1 |
| 5 | bank statement pdf to excel free online | bank | T | 0 | 2 | 3 | 2 | 0 | 1 | 4 | 0 |
| 6 | convert scanned bank statement to excel | bank | T | 1 | 2 | 1 | 0 | 1 | 0 | 1 | 2 |
| 7 | bank statement to ofx converter | bank | T | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| 8 | credit card statement pdf to csv converter | bank | T | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 1 |
| 9 | invoice pdf to excel converter online | invoice | T | 2 | 1 | 0 | 1 | 0 | 0 | 2 | 0 |
| 10 | extract data from invoices to excel software | invoice | C | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 1 |
| 11 | invoice ocr software for small business | invoice | C | 1 | 0 | 3 | 0 | 1 | 2 | 0 | 0 |
| 12 | bulk invoice data extraction tool | invoice | T | 2 | 2 | 0 | 0 | 1 | 1 | 0 | 1 |
| 13 | pdf invoice to csv converter | invoice | T | 4 | 0 | 0 | 0 | 2 | 0 | 1 | 1 |
| 14 | purchase order pdf to excel converter | invoice | T | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| 15 | invoice line items extraction to spreadsheet | invoice | T | 1 | 1 | 0 | 2 | 0 | 1 | 0 | 1 |
| 16 | financial statements pdf to excel converter | financial | T | 0 | 1 | 1 | 1 | 0 | 1 | 0 | 0 |
| 17 | balance sheet pdf to excel converter | financial | T | 1 | 1 | 0 | 0 | 1 | 1 | 4 | 0 |
| 18 | annual report tables to excel tool | financial | T | 1 | 0 | 2 | 1 | 0 | 0 | 0 | 3 |
| 19 | 10-K financial statements to excel | financial | T | 3 | 0 | 0 | 1 | 0 | 0 | 1 | 1 |
| 20 | profit and loss statement pdf to excel | financial | T | 0 | 0 | 0 | 0 | 1 | 0 | 5 | 1 |
| 21 | receipt scanner to spreadsheet online tool | receipt | T | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 22 | receipt ocr to csv | receipt | T | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| 23 | expense receipts to spreadsheet app | receipt | T | 1 | 4 | 0 | 2 | 0 | 0 | 0 | 0 |
| 24 | convert receipts to excel for taxes | receipt | T | 2 | 4 | 2 | 0 | 0 | 0 | 0 | 0 |
| 25 | bulk receipt scanning software | receipt | C | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 1 |
| 26 | receipt data extraction api pricing | receipt | C | 1 | 3 | 1 | 0 | 0 | 1 | 0 | 0 |
| 27 | extract tables from pdf to excel tool | tables | T | 0 | 1 | 1 | 1 | 0 | 1 | 4 | 0 |
| 28 | pdf table to csv converter | tables | T | 1 | 0 | 1 | 2 | 0 | 0 | 1 | 1 |
| 29 | batch convert pdf tables to excel | tables | T | 2 | 2 | 2 | 0 | 0 | 2 | 1 | 0 |
| 30 | pdf to excel converter for accountants | tables | T | 0 | 0 | 2 | 0 | 1 | 0 | 4 | 0 |
| 31 | scanned pdf to excel converter | scanned | T | 1 | 1 | 2 | 2 | 0 | 1 | 1 | 0 |
| 32 | multi page pdf table to excel | tables | T | 0 | 2 | 1 | 1 | 3 | 0 | 2 | 0 |
| 33 | payslip pdf to excel converter | specialised | T | 1 | 2 | 0 | 0 | 1 | 1 | 1 | 1 |
| 34 | brokerage statement pdf to excel | specialised | T | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| 35 | 1099 pdf to excel converter | specialised | T | 2 | 1 | 1 | 1 | 2 | 0 | 0 | 1 |
| 36 | utility bill data extraction software | specialised | C | 6 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 37 | bill of lading pdf to excel | specialised | T | 2 | 1 | 0 | 0 | 0 | 0 | 3 | 0 |
| 38 | handwritten form to excel converter | specialised | T | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 39 | insurance claim form data extraction tool | specialised | C | 3 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 40 | pay stub data extraction | specialised | T | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

The per-row business lists are in the dataset file. Intent: T = transactional/tool, C = commercial investigation.

## Baseline counts (A5)

| Measure | Count |
|---|---|
| Queries investigated | 40 |
| With clear commercial intent | 40 (by design; none were informational "how to" queries) |
| Dominated by established specialists and platforms (E+P ≥ half of results, no N) | 10 |
| Where newer or smaller products are visible (≥1 N) | 26 |
| With an **RDAP-verified 2024+ specialist** whose own site or help docs rank | **15** (16 counting a press-release-only result) |
| With ≥2 spam/parasite pages (weak result quality on this engine) | 8 |
| Where a general AI/AI-spreadsheet tool appears | 13 |
| With verified paid offerings: published price checked on the vendor's own page | 5 vendors: DocuClipper, BankConv, invoicedataextraction.com, Bankstatemently (tiers), PDF-to-QBO on Gumroad ($79, search snippet only) |
| With independently verified paid demand | 1 vendor (Bankstatemently); it was **not** observed in these 40 result sets |
| Where the actual acquisition channel of ranking businesses is known | **0** |

## Newcomer examples (A4), with evidence types kept separate

| Product | Domain registered (RDAP) | Launch date verified? | Search visibility (this study) | Independent/small? | Public pricing | Verified adoption / paid demand |
|---|---|---|---|---|---|---|
| invoicedataextraction.com | 2024-07-24 | No | 7 queries (invoices, receipts, payslips) | Operated by DEH Technologies LLC (pricing page); size unknown | 50 free pages/month; credits $12/100 pages to $1,375/25k pages ([pricing](https://invoicedataextraction.com/pricing), checked 2026-10-22) | **None found.** G2 page inaccessible (403) |
| BankConv (bankconv.com) | 2024-09-03 | No | 4 queries (mostly its help-docs subdomain) | Unknown | $29/$49/$79 a month; $19/$29/$49 on annual billing; $2.99 per document ([pricing](https://bankconv.com/pricing)) | **None found** |
| ImageToTable.ai | 2026-01-13 | No | 5 queries (payslip, 1099, bill of lading, handwriting, receipts) | Unknown | Pay-as-you-go after a free daily quota; amounts not shown on homepage ([site](https://imagetotable.ai/)) | **None found** |
| SheetFerry (sheetferry.lovable.app) | sheetferry.com 2025-11-07 | No | 1 query (brokerage statements) | Built on a no-code host, so likely indie (inference) | Free-credit model | **None found** |
| HandwrittenToExcel.com | 2026-04-21 | Press release dated July 2026 | Ranked **via paid press-release syndication**, not its own site | Unknown | Not checked | Self-claim of 5,000 organisations: **vendor claim, not verified** |
| **Bankstatemently** (bankstatemently.com) | 2025-09-10 | TrustMRR lists founding 2025-09-29 | **Not observed** in the 40 result sets | Singapore company, founder with 121 X followers (TrustMRR) | Free tier; credit packs from $7.50; subscriptions from $25/mo | **Stripe-verified:** $1,420 all-time; best month $458 (2026-07); $375 MRR from 14 subscriptions at last sync (2026-08-04). Its channel is **unknown** ([TrustMRR](https://trustmrr.com/startup/bankstatemently.md)) |
| OCR.so | Unavailable via RDAP | TrustMRR lists founding August 2026 | Not observed | Unknown | $0.010 per page | Verified $155 all-time (TrustMRR, via search snippet; underlying page not inspected) |

**Interpretation:** small and young sites do get **shown** for long-tail purchase queries. The only one with verifiable
payments earns about $375 MRR, and nothing ties that revenue to organic search.

## Competitive structure (A2)

- **Bank and credit-card statements:** the most crowded category. Established specialists (DocuClipper, MoneyThumb, Nanonets,
  Veryfi, Parsio) sit alongside several 2024–26 entrants (BankConv, Bankstatemently, new iOS apps, Gumroad tools) and free
  tools (Founderpath, Pelcro). This is the **most contested** category, not an opening.
- **Invoices and purchase orders:** dominated by AP-automation vendors (Parseur, Lido, Docparser, Klippa, Nanonets) plus one
  visible 2024 entrant. **Little room.**
- **Financial statements and 10-K:** split between enterprise data platforms (AlphaSense, Daloopa, sec-api) and spam pages.
  Free official XBRL data on SEC EDGAR substitutes for the public-company case.
- **Long-tail specialised documents** (payslips, 1099s, bills of lading, handwriting, brokerage statements): the **most
  newcomer-visible** segment. ImageToTable, SheetFerry and invoicedataextraction appear. These are also exactly the queries
  where general multi-document AI extractors compete.
- **Spam-heavy results** (P&L, accountants, PDF tables): low-quality pages rank on this engine. That suggests thin
  specialist competition, but **not** that a new site would earn traffic.

**Could a new entrant compete without backlinks or outreach?**
- **Plausible explanation:** a narrow use-case page (one document type, one export format such as QBO), with a working free
  converter on the page, can be shown for long-tail queries. This is what the young domains above appear to do.
- **Unproven:** whether this produces paying customers. The only verified revenue example is tiny, and its channel is unknown.

## Discovery channels

| Channel | How a customer finds it | Evidence it works for newcomers | Status |
|---|---|---|---|
| Organic search: long-tail document-type pages with a working free converter | Query → result → instant conversion → paywall on volume or exports | Young domains ranked in 15 of 40 queries; no traffic or revenue attribution | **Plausible, unproven** |
| Directories (Capterra, GetApp, Product Hunt, AlternativeTo) | Listing pages rank for some queries | BillToSheet and Invoscope listings rank but show 0 reviews (search snippets); G2/Capterra pages returned 403 | Weak |
| Marketplaces (Google Workspace add-on, App Store) | In-store search | New iOS apps (IDs 675…) and a Workspace bank-statement converter appear in web results; no adoption data | Not tested |
| Integration directories (QuickBooks/Xero app stores) | Accountant searches the app store | Not researched this session | Unknown |

## Limitations

- **One engine on one day, US results, not Google.**
- **Classification is manual.**
- **Directory and review pages were mostly inaccessible** (G2/Capterra 403), so adoption may be under-observed. Inaccessible is
  **not** negative evidence.

## Sources (accessed 2026-10-22)

- Search results: WebSearch tool, 40 queries listed above.
- RDAP: `https://rdap.org/domain/<domain>`.
- Pricing pages:
  - [DocuClipper](https://www.docuclipper.com/pricing/)
  - [BankConv](https://bankconv.com/pricing)
  - [Invoice Data Extraction](https://invoicedataextraction.com/pricing)
  - [ImageToTable](https://imagetotable.ai/)
  - [Bankstatemently](https://bankstatemently.com/)
- Verified revenue: [TrustMRR: Bankstatemently](https://trustmrr.com/startup/bankstatemently.md).
