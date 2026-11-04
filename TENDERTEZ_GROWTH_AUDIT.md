# TenderTez growth audit: Phase 1 of the Growth Engine (4 Nov 2026)

Read-only audit. Nothing was changed, deployed, bought or sent. Production was
read only through read-only scripts. User counts exclude the founder's own
accounts (`BIDPILOT_ADMIN_EMAILS`); no user is named.

This report builds on the 30 Oct research
(`marketing/research/2026-10-30-india-growth-validation.md`). It re-measures
everything that may have changed since, and adds new free-tool, conversion and
competitor findings.

**Evidence labels**

| Label | Meaning |
|---|---|
| **[M]** | Measured today from TenderTez's own data, code or live site |
| **[A]** | Google India autocomplete, 4 Nov 2026 (`gl=in`). It shows that people type a query, **not how often**. |
| **[S]** | Stated by a public source (linked) |
| **[V]** | A vendor's claim about itself (unverified) |
| **[E]** | My estimate |
| **[H]** | My hypothesis |
| **[U]** | Unknown; how to find out is given |

**No search volumes, keyword difficulty or competitor revenues appear anywhere
in this report.** No free source gives reliable Indian figures, and none were
invented.

---

## 0. Summary

TenderTez is technically ready for search; tiny, falling traffic is not mainly
a technical problem. All 53 sitemap URLs are clean, server-rendered,
canonical and titled [M]. The real gaps:

- **Discovery is minimal.** 177 visitor-days in 30 days, founder visits
  included. 23 visits came from Google; recent days show 2–5 visitors [M].
- **Organic visitors don't convert.** The only page Google sends people to
  (the EMD exemption guide) produced 13 journeys and 0 visits to sign-up [M].
- **Retention is unproven.** All time, 3 external companies have each analysed
  1 tender: 0 came back for a second, 0 paid, and none has signed up since
  28 Oct [M].
- **The market is crowded and cheaper.** At least 15 Indian players now
  publish free calculators, free generators or free first AI scans. Paid
  prices run from ₹199 a tender up to ₹15,999 a month [S/V], against
  TenderTez's ₹3,999 a month and a mailto checkout [M].

**The opportunity TenderTez is best placed for** is free tools that use what
competitors' calculators can't: reading the user's own tender with page-linked
evidence. The **first tool belongs on the EMD exemption guide**, the one page
that already earns Google visits.

**Caveat that governs the whole plan:** an acquisition engine multiplies a
funnel. Today's funnel has 0 repeat users and 0 payers [M]. The roadmap below
therefore builds tools that also measure activation and repeat use, and it
keeps the 30 Oct decision rule: if 0–1 of the next 10 activated companies
come back, fix the product or segment before scaling acquisition.

---

## 1. Technical SEO

### 1.1 Results (live, 4 Nov) [M]

| Check | Result | Verdict |
|---|---|---|
| robots.txt | Allows public pages. Disallows the API and signed-in app (`/bidpilot/`, `/dashboard`, `/tenders/`, `/company-profile`, `/onboarding/`, `/verify-email`, `/clients`, `/feed`, `/insights`). Names AI search crawlers explicitly; links `llms.txt` and `ai.txt`. | OK |
| Sitemap | **53 URLs** (58 on 30 Oct). 0 broken. State and organisation lists drop out automatically when they fall below 20 open tenders, by design (no thin lists). | OK |
| `ttm seo-audit` (server HTML of every sitemap URL) | 0 pages with issues. 0 broken internal links. 52 of 53 have an H1 in the server HTML (all but `/register`). 47 of 53 have structured data. | OK |
| Canonical URLs | Self-canonical on every page checked. A trailing slash and the `fly.dev` host both carry the `tendertez.in` canonical. | OK |
| Redirects | `http://www.` → `https://www.tendertez.in/` → apex (two hops). `tenderlytic-api.fly.dev` answers 200 instead of redirecting; the canonical contains the risk. | Low |
| Titles and descriptions | Unique, titles ≤ 60 characters (30 Oct check). | OK |
| Structured data | Organization and WebSite (home), SoftwareApplication with Offer (pricing), FAQPage (FAQ, consultants), Article and BreadcrumbList (guides), plus the lists. None on `/features` or `/sample-analysis` (30 Oct). | Minor |
| `/register` | Indexable and in the sitemap, with no H1 or text in its server HTML. | Low |
| Index presence | A public web index lists home, features, pricing, FAQ, about, privacy, guides, all three guides, consultants, sample and several state and organisation lists. **Only a rough signal**: Google's own index status needs Search Console [U]. | Partial |

### 1.2 Page speed and mobile (Lighthouse 12.2.1 mobile, live, one run each) [M]

Lab data, run from a non-Indian network. These are not field (CrUX) numbers.

| Page | Perf | SEO | Access. | Best pr. | CLS | LCP | Page weight |
|---|---|---|---|---|---|---|---|
| `/` | 91 | 100 | 95 | 96 | 0.000 | 2.1 s | 193 KB |
| `/pricing` | 97 | 100 | 90 | 96 | 0.000 | 2.0 s | 189 KB |
| `/guides/emd-exemption` | 100 | 100 | 90 | 96 | 0.000 | 1.1 s | 191 KB |
| `/tender-consultants` | 100 | 100 | 90 | 96 | 0.000 | 1.1 s | 192 KB |
| `/register` | 96 | 100 | 95 | 96 | 0.055 | 2.0 s | 187 KB |
| **`/government-tenders/state/uttar-pradesh`** | **82** | 100 | 96 | 96 | **0.308** | 2.0 s | 202 KB |
| `/sample-analysis` (fixed and deployed 2 Nov, v53) | 80–100 | — | — | — | 0.000 | 1.1–2.1 s | — |

**New finding: the state and organisation tender lists have a poor layout
shift (0.31; Google's "poor" threshold is 0.25)** [M]. They make up most of
the sitemap.

- **What moves:** the CPPP source line (y 283 → 325), then the filters and the
  "Found one worth bidding for?" call to action. The footer and an icon are
  pushed off-screen [M, browser trace].
- **Cause:** the same pattern just fixed on the sample page. The app replaces
  the server HTML with a "Loading tenders…" state, then the list arrives.
- **Fix:** of the same kind as the sample fix, and small.

Other speed notes:
- Every page loads one shared app bundle of about 190 KB compressed.
- Each public page logs a harmless browser error: the signed-out session
  check `/bidpilot/me` answers 401, which costs a few best-practice points.

### 1.3 Internal linking [M]

- The home page links to the sample, features, consultants, pricing, FAQ and
  tender search. **It links to the guides only from the footer.** The guides
  are the content Google rewards.
- The EMD guide links to the other two guides, the sample and sign-up ("Analyse
  a tender free"). Its readers' question ("am I exempt, and what do I upload?")
  has no interactive next step.
- The 42-odd list pages link to tenders' own portals and to TenderTez sign-up.
  They don't link to the guides that would explain EMD or eligibility for
  those tenders.

### 1.4 Duplicate and thin pages [M]

- **Lists:** each has at least 20 real open tenders, the CPPP credit and "not
  every tender". They are templated, though, so they look alike apart from the
  data. They must stay data-first (CLAUDE.md "no doorway pages"). Expanding
  them is not recommended: 30 Oct data showed weak conversion from them.
- **`/register`:** thin, but harmless.
- **`fly.dev` host:** a duplicate host, contained by its canonical.

---

## 2. Website conversion

### 2.1 Funnel (production, read-only) [M]

| Stage | Last 30 days (visits report) | All time, external only |
|---|---|---|
| Visitor-days | 177 (founder visits **included**, can't be separated) | — |
| Saw `/register` | 21 visitor-days (12%) | — |
| Accounts created | 5 (**includes founder test accounts**) | **3 users, 3 companies** (first 7 Oct, last 28 Oct) |
| Uploaded a tender | 6 | **3 of 3 companies** (5 tenders) |
| Completed analysis | 4 | **3 of 3 companies** (3 of 5 tenders; the other 2 waited for an Analyze click, before release v52 made the start automatic) |
| Second analysis / active on 2+ days | — | **0 of 3** |
| Paid plan | — | **0** (no subscription rows) |
| Read failures | — | 0 |
| Feed tenders tracked by external users | — | 0 |

**Where people stop:**
1. **Visit → sign-up page: about 12%.** Mostly home-page visitors; denominator
   inflated by founder visits.
2. **Google visitor → sign-up: 0 of 23** Google visitor-days in 30 days.
3. **First analysis → second analysis: 0 of 3.** This is the decisive gap.
4. **Trial → paid: no data.** No external company has used up its 5 free
   tenders.

Once someone signs up, they upload and get an analysis (3 of 3); no
evidence suggests the upload flow itself loses people.

### 2.2 Page-by-page [M, code and live pages]

| Area | What exists | Issue or risk |
|---|---|---|
| Home | H1 "Understand a 150-page tender in minutes, not days". Sample link, features, consultants card, search. 638 words. | Leads with speed, not with the differentiator (page-linked evidence). The guides are only in the footer. |
| Pricing | 5 tenders free, no card. Starter ₹3,999 / Growth ₹5,999 / Pro ₹8,999 a month. "Choose plan" buttons are **mailto links**. | No online payment. A "Choose" click isn't recorded, so plan interest is invisible. The price is 10–20× competitors' entry points (§5). |
| Registration | Email and password (name optional), or Google sign-in (configured in production). Company created automatically; lands on the dashboard. Phone sign-in exists but is hidden (secrets not set). | Low friction. |
| Email verification | Tokens are created, but **no email provider is connected**; login doesn't require verification. 1 of 3 external users is marked verified (the Google sign-in). | Fine for friction. But TenderTez **cannot send any email**: no onboarding, no "your analysis is ready", no day-7 re-engagement. That is a retention lever missing (§2.3). |
| PDF upload | First-run panel: what to upload, the 50 MB limit, steps, the sample, what to do if a read fails. Analysis starts automatically under a disclosed notice (since v52). Profile optional for the first 3 tenders. | Good. A 270-page tender analysed in about 2.5 minutes on 29 Oct. |
| Analysis | Key facts, dates, eligibility vs profile, checklist (Excel), BOQ, flagged clauses, corrigendum check, annexure drafts; page and quote for each point. | Strong. The value is visible publicly only through one sample. |
| Payment | Manual: email, payment details by reply, founder activates with `subscription.mjs`. | Every paying customer needs the founder in the loop: a hard ceiling on "predominantly automated" acquisition. |

### 2.3 Why no one returns (hypotheses, untested) [H]

Asking the 3 activated companies is the only way to know; that is still
outstanding from 30 Oct.

1. **No reason to come back is sent.** There is no email, no alert and no
   reminder. Saved-search alerts exist in the code but can only show in-app.
2. **Low tender frequency** in the first users' segment.
3. **The first output was "enough"** for a one-off check.
4. **Price expectation** set by ₹199–₹599 competitors.

---

## 3. Existing analytics

| What | Status | Evidence |
|---|---|---|
| Own visit counter (`page_views`) | **On.** No cookies; daily-reset visitor ID; records path, referrer host, `utm_source` and device. Founder visits **not** excluded. Data from 12 Oct. | [M] |
| Google Analytics 4 | **On in production** (secrets set). **Server-sent `page_view` only**, public pages only, no IP or user agent; no browser tag, by design (CSP). **No events** for sign-up, upload, analysis or plan click, so GA4 has no conversions. TenderTez has no read access to GA4 reports from here. | [M] code, secret names |
| Google Search Console | Domain verified (16 Oct notes). Whether the sitemap was submitted: **unknown**. **No query, impression or index data has ever been read** [U]. | [M]/[U] |
| Bing Webmaster Tools | Unknown [U]. | — |
| Conversion data | In the app database: users, tenders, analysis status, subscriptions, `tender_events` (automatic-analysis requests and skips). Shown on `/insights` and in the nightly and weekly emails, founder accounts excluded. | [M] |
| Server metrics | Log lines `metric bidpilot_analysis`, `bidpilot_auto_analysis` and the cap metrics; not aggregated anywhere. | [M] |
| Crawler counter | Search and AI crawler hits counted for `/insights`. | [M] |
| Historical metrics available | Visits since 12 Oct; users and tenders since 21 Sep; weekly site metrics recorded by the weekly report (first row 2 Nov: 48 visitors, 1 sign-up, 0 paid). | [M] |
| Missing | Search impressions, queries and clicks; plan-click interest; reasons for not buying; tool usage (no tools yet). | — |

---

## 4. Organic acquisition opportunities

Evidence per cluster: what Google India autocompletes [A], who ranks today
(web search, 4 Nov) [S], and TenderTez's own data [M]. No volumes.

| Cluster | Autocomplete evidence [A] | Who ranks / competition [S] | TenderTez today [M] | Opportunity |
|---|---|---|---|---|
| **EMD exemption (MSE, startup, GeM)** | 10 variants: "emd exemption for msme in gem", "… latest circular", "… for works contract", "documents required for emd exemption", "emd exemption letter format for msme" | Vendor blogs (Minaions, TendersPlus, ClearBid, Nexizo), GeM bid PDFs, Startup India | **Only page earning Google visits** (13 journeys in 30 days) | High: add an exemption **checker** to this page |
| EMD calculation | "emd calculation in tender / in gem / formula", "tender emd calculator", "emd rate for tender kerala / karnataka", "emd percentage for tender" | **Crowded**: free calculators from TenderCalc, BidShakti, Digi Karya, TrackTender | None | Medium, only combined with the exemption checker |
| **Bid capacity** | ~20 variants: "bid capacity calculation excel sheet (download)", "formula pwd / cpwd / railway / in hindi / with example" | TenderZenith calculator, InfraLens worked examples, a CA firm, Bihar RWD's own calculator, department PDFs (the multiplier varies: 1.5, 2, 2.5) | None | High for works contractors: calculator + formula variants by department |
| **Make in India local content** | "local content calculation formula / example india", "mii local content calculation", "make in india local content calculation", "class 1 local supplier" | DPIIT order PDFs, a TenderKart blog, YouTube; **no calculator found in the top 8** | None | Medium–high, little competition seen |
| Bid security declaration / ATC acceptance | "bid security declaration format (pdf / word / gem / in lieu of emd / as per gfr 2017)", "gem atc certificate format" | **Free generators exist**: Edafter, Bidz365; GeM PDFs | Annexure engine exists (in-app) | Low–medium (crowded) |
| Eligibility criteria | "government / railway / cpwd / nhai / pwd / gem / ireps tender eligibility criteria", "turnover criteria for tender cvc guidelines" | Buyers' PDFs, vendor guides; **free AI eligibility checks**: CheckTenderAI (free tier), TenderFlow Pro (first scan free) | Eligibility guide exists (no Google entries yet) | High: TenderTez's core; a free, evidence-linked snapshot |
| GeM ATC / bid document | "gem atc clauses", "gem atc document / pdf / latest", "gem bid document generator / format / search" | BidQuest, ContraVault, TenderLabs, TenderDetail explainers; buyers' ATC PDFs | None | Medium: guide + "ATC reader" |
| Tender checklist | "tender checklist template excel / format", "tender document checklist", "tender submission checklist", "documents required for government tenders in india" | Templates, buyers' PDFs | In-app checklist with Excel export | Medium: free checklist from a PDF |
| BOQ | "tender boq format excel / download / meaning / kaise download kare", "boq rate analysis / pwd" | Templates, PWD rate documents | BOQ extraction in-app | Low–medium: BOQ queries are mostly templates and rate analysis, which TenderTez doesn't do |
| AI tender analysis | "ai tender analysis / evaluation / review", "tender analysis software", "tender summary ai" | Listicles by competitors (Tender247, ContraVault, Nexizo, TenderKart). **TenderTez not mentioned** in Tender247's 16 Oct list. Directories (GetApp, Capterra, SaaSworthy). | Pages exist | Medium: free directory listings; honest inclusion requests |
| Corrigendum | "corrigendum tender meaning (in hindi)", "tender corrigendum format / document" | Explainers | Guide + in-app corrigendum check | Low–medium |
| Hindi / Hinglish | "… in hindi" variants for bid capacity, corrigendum, performance security; "tender boq kaise download kare" | — | English only | Test with one Hindi section; don't translate the site |

**Reading of the evidence:**
- Calculation and format queries ("how to calculate", "format", "excel",
  "calculator") are plentiful in autocomplete. Plain calculators are crowded,
  though.
- TenderTez's defensible angle is **"check this against my tender"**: a tool
  whose result reads the user's own PDF and quotes the page.

---

## 5. Competitor landscape (public pages, 30 Oct and 4 Nov; claims [V])

### 5.1 AI document readers (direct)

| Product | Positioning | Published price | Free offer |
|---|---|---|---|
| [Tenderbook](https://www.tenderbook.in/) | Discovery + AI synopsis + competitor data | ₹199 per tender; annual from ₹2,499 (+GST) | "Start free"; bid-capacity blog (4 May 2026) |
| [Tender Sahayak AI](https://tendersahayakai.com/) | GeM search + analyser | ₹399 / ₹999 / ₹4,999 a month (launch offer) | "Starter free to try" |
| [TenderFlow Pro](https://tenderflowpro.in/) | "Parse 500-page tenders in 45 seconds"; eligibility vs GFR 2017; protest letters | ₹599 one-time, ₹2,999 one-time, ₹6,999 / ₹15,999 a month | **First scan free**; free 50-point GeM vetting checklist (lead magnet) |
| [CheckTenderAI](https://www.checktenderai.com/) | Clause-by-clause eligibility "verdict" | Not shown | Free tier, "limited eligibility checks" |
| Tenders Agent | Discovery + extraction | ₹2,999 a year (directory summary) | 3 AI summaries a month |
| [TenderKart](https://tenderkart.in/), [Tender247](https://www.tender247.com/), Minaions, Nexizo, ContraVault, BidQuest, ClearBid | Discovery or AI analysis; heavy blogging (2026 posts on EMD, ATC, Make in India, "best AI tools") | Mostly not shown | Free search/alerts; blogs |
| QuickBid, BidShakti, DocuExprt | Workflow / enterprise; demos | Not shown | BidShakti has a **free EMD calculator** |
| [Lucius AI](https://ailucius.com/guest-analysis) (not India-focused) | Free analysis with **no signup**: risk score, top risks, first requirements, dates | Not shown | The no-signup preview model, a reference design |

### 5.2 Free-tool publishers (organic acquisition by tools)

| Tool type | Who offers it free [S] |
|---|---|
| EMD calculator | TenderCalc, BidShakti, Digi Karya, TrackTender |
| Bid capacity calculator | TenderZenith; InfraLens (worked examples); Bihar RWD (official) |
| ePBG / performance guarantee calculator | Professional Utilities |
| Bid security declaration / ATC certificate generator | Edafter, Bidz365 |
| Free first AI scan / eligibility check | TenderFlow Pro, CheckTenderAI, Lucius AI (non-India) |
| Lead-magnet checklists | TenderFlow Pro (50-point GeM checklist) |

**Their organic strategies, as observed [S]:**
1. Dated "2026" explainer blogs on every procurement rule.
2. Free calculators on `/tools/…` URLs, ranking for "calculator" queries.
3. "Best AI tools for tenders" listicles that rank their own product first.
4. Free first scans to capture uploads.
5. Directory listings (GetApp, Capterra, SaaSworthy).

None of these is unique; the space moved fast in 2026.

**Where TenderTez is genuinely different [M]:**
- Every point carries its page and quote, and a public unedited sample proves
  it.
- A profile per client firm, for consultants.
- A checklist built only from the tender's own requirements.
- A corrigendum check that quotes the changed text.
- Annexure drafts that never invent values.
- No bid/no-bid "verdict" is claimed. Some competitors sell one; TenderTez
  must not (CLAUDE.md).

---

## 6. Ten free tool opportunities

Ranked by fit with TenderTez's strength, demand evidence, competition and
conversion path. Effort is an estimate [E].

| # | Tool | Demand evidence | Competition | Why TenderTez | Conversion path | Needs AI? | Effort [E] |
|---|---|---|---|---|---|---|---|
| 1 | **EMD exemption checker**: answer 4–5 questions (MSE with Udyam? category? startup with DPIIT? GeM or works?) and get "likely exempt / not / check the tender", what to upload and the rule quoted with its source and date | [A] 10+ variants; the existing guide already earns Google visits [M] | Guides only; no interactive checker found | Lives on the one page with organic traffic; rule-quoting fits the brand | "Check your tender's EMD clause": upload → the analysis shows the clause with its page | No (rules) | 2–3 days incl. rule verification |
| 2 | **Free eligibility snapshot**: upload a tender PDF, no account, and see the first eligibility conditions and EMD with page numbers; the full analysis needs sign-up | [A] eligibility criteria variants; competitors offer free first scans | TenderFlow Pro, CheckTenderAI, Lucius (non-India) | **The core product, page-linked**; the strongest differentiator | Sign up to keep it and see the rest | Yes (cost per use) | 5–8 days (rate limits, abuse protection, privacy policy update) |
| 3 | **Bid capacity calculator** with the department multiplier (1.5 / 2 / 2.5 / 3), price escalation of past years, worked examples, and an Excel download | [A] about 20 variants incl. "excel", "pwd", "cpwd", "railway", "hindi" | TenderZenith, InfraLens, Bihar RWD | Can link to "find the formula in your tender" (upload) | Upload to see the tender's own formula | No | 2–3 days |
| 4 | **Make in India local content calculator**: items × cost × domestic share, weighted average, Class I (≥50%) / II (≥20%) per the DPIIT order of 19 Jul 2024 | [A] 10 variants incl. "example india", "mii" | **None found in top results** | Cites the order and the tender's own MII clause | Upload to find the tender's MII clause | No | 2–3 days (order read to the end, lesson 27) |
| 5 | **GeM ATC reader**: paste or upload the buyer's ATC, get clauses that add documents, experience, OEM or local-presence conditions, each quoted | [A] "gem atc clauses / document / pdf" | Explainers only; no reader found | Quote-based extraction is TenderTez's core | Sign up to check the whole bid | Yes (small) | 3–5 days |
| 6 | **Submission checklist from a tender**: upload, get the documents to submit as Excel | [A] "tender checklist template excel", "tender document checklist" | Templates only | The checklist exists in-app, built only from requirements | Sign up to tick items off | Yes | Reuses #2 (2 days on top) |
| 7 | **Turnover and experience eligibility check**: enter turnover by year and similar works, and the tender's thresholds (e.g. "X% of estimated cost over N years") | [A] "turnover criteria for tender cvc guidelines", "average annual turnover in tender" | Guides only | Matches the profile check in-app | Upload to read the thresholds from the tender | No | 2 days |
| 8 | **Tender cost calculator**: EMD + performance security (GFR range) + tender fee + bank charges in one place | [A] EMD and "performance security as per gfr 2017" variants | Crowded (EMD, ePBG calculators) | Only worthwhile as a bundle linked to #1 | Weak | No | 1–2 days |
| 9 | **Corrigendum compare**: upload the tender and its corrigendum, see what changed, quoted | [A] corrigendum meaning/format variants | None found | Exists in-app | Sign up to track the tender | Yes | Reuses the in-app feature (3–4 days) |
| 10 | **Bid security declaration / ATC acceptance letter generator** | [A] many "format" variants | **Crowded**: Edafter, Bidz365 | Annexure engine exists | Weak | No | 1–2 days |

**Recommended order:** 1, 3 and 4 first (no AI cost; each sits on a demand
signal; 1 sits on existing traffic). Then 2, the biggest bet. It is also the
most costly and needs abuse protection and a privacy-policy update. 5 and 6
reuse 2. Skip 8 and 10 unless they come almost free.

---

## 7. The five biggest problems

1. **No evidence of repeat use or payment.** 3 external companies, 3 first
   analyses, 0 second analyses, 0 paid, 0 new external sign-ups since 28 Oct
   [M]. More traffic multiplies this funnel; it doesn't fix it.
2. **Almost no discovery, and it is falling.** 177 visitor-days in 30 days
   (founder visits included); 2–5 a day in November; 23 from Google [M]. The
   site is technically sound, so the gap is content and tools people search
   for, plus off-site presence.
3. **Organic visitors have no next step that matches their question.** 13
   Google journeys to the EMD guide led to 0 sign-up visits [M]. The only call
   to action asks for an account.
4. **Growth can't be measured or automated end to end:**
   - no Search Console data read;
   - GA4 has page views but no conversion events;
   - plan clicks aren't recorded;
   - founder visits are mixed into visit counts;
   - **no email channel** (no provider), so no onboarding or re-engagement;
   - **no online checkout** (mailto plus manual activation) [M].
5. **A crowded, cheaper market TenderTez isn't visible in.** 15+ players
   offer free calculators, generators or first scans; entry prices run from
   ₹199 a tender to ₹599 one-time [S/V]. TenderTez is absent from ranking
   listicles and directories [S]. Plus a technical item: **the tender list
   pages, most of the sitemap, have a poor mobile layout shift (0.31)** [M].

## 8. The ten highest-priority opportunities

| # | Opportunity | Why now | Impact | Confidence |
|---|---|---|---|---|
| 1 | Connect Search Console + Bing; confirm the sitemap is submitted; export 28 days of queries and pages | Every SEO decision is guesswork without it | Enables all | High |
| 2 | **EMD exemption checker** on the EMD guide (tool 1), with tool → upload measured | Sits on the only organic traffic | Medium–high | Medium |
| 3 | Fix the layout shift on the tender list pages (same pattern as the sample fix) | 40+ indexed pages rated "poor" on mobile | Medium | High |
| 4 | Conversion measurement: server-side GA4 events (`sign_up`, `upload`, `analysis_complete`, `plan_click`) + exclude founder visits + record plan-button clicks | Can't optimise what isn't counted | Enables all | High |
| 5 | Bid capacity calculator + formula guide (tool 3) | Strongest autocomplete demand for works contractors | Medium | Medium |
| 6 | Make in India local content calculator + guide (tool 4) | Demand with no calculator found | Medium | Medium |
| 7 | Free eligibility snapshot without an account (tool 2) | Matches competitors' free first scans with a better, page-linked output | High if it converts | Low–medium (cost, abuse) |
| 8 | Transactional email (analysis ready; day-3 and day-7 check-ins; saved-search alerts) | The only automated retention lever | Medium–high for repeat use | Medium |
| 9 | Online payment links per plan (prices unchanged) | Removes the manual step for anyone ready to pay | Low now (no one at the paywall yet), needed later | Medium |
| 10 | Off-site presence: free G2 / Capterra / GetApp / SaaSworthy product listings; honest inclusion requests to listicle authors; link the guides from the home page | Directories and listicles own "AI tender analysis" queries | Medium | Medium |

## 9. Proposed 30-day roadmap

Each code item is planned, tested (`verify.sh` plus a browser check) and
deployed only after the founder's "deploy". Each content item is published
only after approval.

| Week | Build (Claude, after approval) | Founder | Done when |
|---|---|---|---|
| **1 (days 1–7): measure and fix** | List-page layout-shift fix. Server-side GA4 events for sign-up, upload, analysis and plan click. Plan-click counter. Exclude founder visits from the visit counter. Home page links to the guides. | Connect Search Console + Bing; submit the sitemap; send me 28-day query and page exports. Ask the 3 activated companies why no second tender. | Lists CLS < 0.1 live; events visible in GA4 Realtime; GSC baseline recorded |
| **2 (days 8–14): first tool on existing traffic** | EMD exemption checker on the EMD guide (rules quoted with dated sources, read to the end); guide refresh; tool → upload tracking. | Approve the rule text; list on G2 (product) and one more free directory. | Tool live; first tool uses and tool → upload clicks counted |
| **3 (days 15–21): calculators for demand signals** | Bid capacity calculator + guide; Make in India local content calculator + guide (both rule-based, sources quoted). | Approve both; one LinkedIn post per tool. | Both live and in the sitemap; GSC impressions start appearing (expect weeks) |
| **4 (days 22–30): decide the big bet** | Design (not build) the free eligibility snapshot: limits, cost cap, abuse protection, privacy-policy changes. Draft the transactional email plan (provider, messages, consent). Review results. | Decide on the snapshot (cost), email provider and payment links. | Decision memo: continue / change segment / rethink, against the 30 Oct thresholds |

Expected signal timing [E]: tool usage within days of launch; Search Console
impressions in 2–6 weeks; ranking movement in 1–3 months. One month will not
show a reliable organic trend.

## 10. Estimated implementation complexity [E]

| Item | Complexity | Effort | Main risk |
|---|---|---|---|
| Search Console + Bing set-up | Very low | 30 min (founder) | None |
| List-page layout-shift fix | Low | 0.5–1 day | Server HTML must keep the list, CPPP credit and "not every tender" |
| GA4 conversion events + plan-click counter + founder exclusion | Low–medium | 1–2 days | Privacy policy wording if the data collected changes |
| EMD exemption checker | Low–medium | 2–3 days | Rule accuracy; rules change. Show dates and sources; never "guaranteed". |
| Bid capacity calculator | Low–medium | 2–3 days | Formulas differ by department; say which formula is used |
| Local content calculator | Low–medium | 2–3 days | Order details and exceptions (read to the end) |
| Free eligibility snapshot | Medium–high | 5–8 days | AI cost per anonymous upload; abuse; privacy (anonymous documents); bounded AI concurrency |
| Transactional email | Medium | 3–5 days | Provider set-up, deliverability, consent, privacy policy |
| Online payment links | Low (links) to medium (integration + automatic activation) | 0.5–4 days | Activation stays manual unless integrated |
| GeM ATC reader / checklist from PDF | Medium | 3–5 days each | Shares the snapshot's cost and abuse issues |

## 11. Dependencies and costs

| Dependency | Cost | Notes |
|---|---|---|
| Google Search Console, Bing Webmaster Tools | Free | Founder's Google/Microsoft account |
| GA4 (already on) | Free | Server events only; no browser tag (CSP) |
| Rule-based tools (1, 3, 4, 7, 8, 10) | No new spend | Hosting unchanged [E] |
| AI-backed tools (2, 5, 6, 9) | **OpenAI usage per use [U]** | Measure the cost of a few real snapshot runs from the OpenAI usage page before deciding. Existing daily caps (`BIDPILOT_ANALYSIS_MAX_CALLS_PER_COMPANY_PER_DAY` and the global cap) bound it. Needs founder approval. |
| Transactional email provider | Free tiers exist at many providers; amount and limits [U] until a provider is chosen | Needs the founder's choice, DNS records (lesson 20: `overwrite: false`), privacy-policy update |
| Payment provider (e.g. payment links) | Per-transaction fee [U]: check the provider's current published rates | Founder's account and KYC; prices unchanged; privacy policy and terms update |
| Directory listings (G2 product, Capterra, GetApp, SaaSworthy) | Free basic listings; don't buy placements or reviews | Founder's accounts |
| Founder time | About 2–3 h a week | Approvals, Search Console, directories, user questions |

No paid ads, paid SEO tools, bought links or bought reviews are needed or
recommended.

## 12. Recommended first three changes

1. **Connect Search Console and Bing, and send me the 28-day exports.**
   - Founder; 30 minutes; no code.
   - Every later choice (which tool, which guide, which page) should be
     checked against real queries and impressions. Everything above is
     autocomplete and SERP evidence, not volume.
2. **Fix the layout shift on the tender list pages, and add conversion
   events** (sign-up, upload, analysis, plan click) **while excluding founder
   visits.**
   - Code, small, low risk; same pattern as the sample-page fix already live.
   - It removes a "poor" Core Web Vitals rating from most of the sitemap.
   - It makes the funnel measurable before any tool ships, so each tool's
     effect can be seen.
3. **Build the EMD exemption checker into the EMD guide.**
   - Rule-based, so no AI cost; rules quoted with dated sources.
   - It meets the question TenderTez's only organic visitors already ask, and
     it leads to "check your tender's EMD clause", which is an upload.
   - Its result (tool → upload → analysis → second tender) is the first real
     test of whether free tools can feed a funnel that retains.

Nothing has been implemented. This audit waits for your review.

---

### Method and sources

**TenderTez data, all read-only:**
- `ttm seo-audit` (4 Nov);
- Lighthouse 12.2.1 mobile on 6 live pages (4 Nov);
- a browser layout-shift trace of a list page;
- `visits-report.mjs 30` and an all-time external funnel query in production
  (counts only; founder accounts excluded);
- code reading of auth, pricing, GA4 and analytics;
- live HTML of the home page and EMD guide;
- Fly secret **names** only (values not read).

**Google India autocomplete:** 47 seed queries, 4 Nov 2026. Raw output is
kept in the session scratchpad, not committed.

**Competitor and tool pages (4 Nov):**
- [TenderCalc](https://www.tendercalc.in/)
- [BidShakti EMD calculator](https://bidshakti.in/tools/emd-calculator)
- [Digi Karya](https://digikarya.com/tools/emd)
- [TrackTender](https://tracktender.com/tools/emd-calculator/)
- [TenderZenith bid capacity](https://tenderzenith.com/tools/bid-capacity-calculator/)
- [InfraLens](https://tenders.infralens.in/resources/available-bid-capacity-formula)
- [Professional Utilities ePBG](https://bids.professionalutilities.com/tools/epbg-calculator)
- [Edafter generators](https://www.edafter.com/tools/bid-security-declaration)
- [Bidz365](https://tools.bidz365.com/bid-security)
- [TenderFlow Pro](https://tenderflowpro.in/)
- [CheckTenderAI](https://www.checktenderai.com/)
- [Lucius AI guest analysis](https://ailucius.com/guest-analysis)
- [Tender247 AI tools list](https://www.tender247.com/blog/best-ai-tender-analysis-tools)
- [Tenderbook bid capacity post](https://tenderbook.in/blogs/bid-capacity-in-tenders-how-buyers-calculate-whether-you-can-handle-multiple-projects)
- [TenderKart Make in India post](https://tenderkart.in/blog/make-in-india-purchase-preference-class-i-class-ii-local-content)
- [DPIIT PPP-MII order](https://tec.gov.in/PPPMII/assets/circular/1722400815PPP-MII_Revision_Order_19July2024.pdf) (not yet read to the end; it must be before any calculator uses it)
- the 30 Oct report's sources

**Not done:** keyword volumes (no reliable free source), competitor revenue,
Search Console and GA4 report data (no access), field (CrUX) speed data, and
tests from an Indian network or real phones.
