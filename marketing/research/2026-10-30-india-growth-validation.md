# TenderTez India growth and market validation (30 Oct 2026)

Research-only pass. Nothing was deployed, published, posted or sent; no
production data, prices or settings were changed. Production was read only
through read-only scripts. Founder and test accounts are excluded from every
user count (the three `BIDPILOT_ADMIN_EMAILS` accounts).

Labels used throughout: **[M]** measured from TenderTez's own data or live site,
**[S]** stated by a public source (cited), **[V]** vendor claim (unverified),
**[H]** my hypothesis, **[U]** unknown.

---

## Deliverable 1: Executive verdict

- **Is there evidence of a real problem?** Yes, moderate.
  - Reading tenders and checking eligibility is a paid job in India: "tender executive" roles list it as the core duty, at ₹15,000–₹40,000 a month [S].
  - Consultants charge ₹500–₹2,500 per bid for preparation and submission [V].
  - At least eight vendors launched AI tender-reading tools in 2025–26 [S/V].
  - Bid rejections are commonly attributed to missing documents and misread conditions [V, vendor blogs].
  - What is not evidenced: that bidders feel the reading itself, as opposed to discovery, paperwork or winning on price, is painful enough to pay a separate tool for.
- **Is there evidence of a viable paid market for TenderTez?** No, not yet.
  - TenderTez has 0 paid customers [M].
  - The market's price anchors are far below TenderTez:
    - Tenderbook: ₹199 per tender, including an AI synopsis [V];
    - Tender Sahayak AI: from ₹399 a month [V];
    - Tenders Agent: listed at ₹2,999 a year [S, directory summary, not opened];
    - TenderTez: ₹3,999 a month for 10 tenders.
- **What is proven [M]:**
  - The product reads and analyses real tenders: a 270-page tender (with OCR) was read in 22 s and fully analysed in 2 min 20 s, with 0 section failures, on 29 Oct.
  - 3 external companies signed up, uploaded and completed a first analysis.
  - One guide (EMD exemption) has started to bring Google visitors on its own (7 entry journeys in 30 days).
- **What is unproven:**
  - Repeat use: 0 of 3 external companies have analysed a second tender [M].
  - Willingness to pay at any price.
  - Which segment returns.
  - Whether organic search can deliver more than a handful of qualified visitors a month.
- **Segment to test first:** tender consultants and small firms with a dedicated bid person (an in-house tender executive).
  - They handle tenders every week, which no occasional bidder does.
  - They are judged on not being rejected on form.
  - TenderTez already has client workspaces, which no competitor advertises publicly [S, search 30 Oct].
  - Caveat: one consultancy already declined, saying it is building its own system [M, CRM]. Consultants can be customers or competitors.
- **Single highest-priority action:** turn the one warm one-to-many channel already open into qualified first analyses, measured. That channel is the MSME association that replied positively on 8 Oct; the proposed format is a members' session analysing members' live tenders.
  - It fits the founder's preference (no mass pitching), puts real tenders into the product, and produces the evidence this plan needs (repeat use and price reactions) faster than SEO can.

---

## Deliverable 2: Current-state audit

### 2.1 Site and SEO (live checks, 29–30 Oct)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | Core public pages are server-rendered with real text: home 638 words, features 589, pricing 356, FAQ 1,231, about 451, consultants 864, three guides 962–1,246, sample 1,070. One H1 each, self-canonicals, titles ≤ 60 characters, descriptions ≤ 156 characters. The 24 Oct finding "core pages send one word" no longer holds. | curl of server HTML [M] | OK |
| A2 | Structured data: Organization and WebSite (home), SoftwareApplication with Offer (pricing), FAQPage (faq, consultants), Article with BreadcrumbList (guides). None on `/sample-analysis` or `/features`. | page source [M] | Minor |
| A3 | **`/sample-analysis`, the product's proof page, has a mobile layout shift of 0.61.** Google's "poor" threshold is 0.25. Home: shift 0, Lighthouse performance 93, SEO 100, accessibility 95. Sample: performance 75. | Lighthouse 12.2 mobile, run locally (PageSpeed Insights API quota was exhausted) [M]. Lab data from a non-India network; no field data checked. | **High** |
| A4 | `/register` is indexed and in the sitemap but its server HTML has no content (0 words). | [M] | Low–Medium |
| A5 | `tenderlytic-api.fly.dev` serves the whole site (200) without redirecting. Its canonical tags point to tendertez.in, so the duplication risk is contained. `http://www.` takes two redirect hops. A trailing slash (`/pricing/`) answers 200 with the correct canonical. | [M] | Low |
| A6 | Every public page logs one browser error: the signed-out session check `/bidpilot/me` answers 401. Harmless, but it costs Lighthouse best-practice points. | Lighthouse console audit [M] | Low |
| A7 | Low-contrast text in a few places: the logo accent and the hero "Example" label. | Lighthouse [M] | Low |
| A8 | Sitemap: 58 URLs, all live; 42 are state/organisation tender lists, each with at least 20 real open tenders. robots.txt allows all public pages; Bytespider is blocked by choice. llms.txt (13 KB) and llms-full.txt (204 KB) answer 200. | [M] | OK |
| A9 | The brand is not yet an entity: a web search for "tendertez" (30 Oct, US index) returns only "tenderize" pages. | [S] | Medium |
| A10 | Claims vs product: no unsupported claims found on core pages. The home "minutes, not days" claim is consistent with the 29 Oct production run (270 pages analysed in about 2.5 min). | [M] | OK |
| A11 | Value is visible before sign-up via `/sample-analysis` (a real AIIMS tender, unedited) and the free tender search. The sample link on the home page is a small text link, and the sample had 4 visitors in 30 days against 125 on the home page. | visits report [M] | Medium |

### 2.2 Journey and first run [M, code and local browser checks, 29 Oct]

- Sign-up asks for an optional name, email and password, or offers Google. The company is created automatically, and the user lands on the dashboard.
- A new company sees the first-run panel: what to upload, the 50 MB limit, the steps, a link to the sample, and what to do if a read fails.
- Since release v52 (29 Oct), a dashboard upload is analysed automatically once its PDF has been read, under a disclosed notice. Before v52, 2 of 5 external uploads waited for an Analyze click.
- The company profile is optional for the first 3 tenders.
- Paying is manual: email, then the founder activates the plan with a script. There is no checkout.

### 2.3 Measurement

| Stage | Measured? | Source | Founder excluded? | Limitation |
|---|---|---|---|---|
| Visits, sources, landing pages | Yes | `page_views` (own counter, no cookies) | **No.** Founder visits can't be told apart. | Visitor ID resets daily; data starts 12 Oct |
| GA4 page views (public pages) | Yes, server-sent | GA4 | No | No read access from here [U] |
| Google search queries and impressions | Only in Search Console | GSC | n/a | No access from here [U] |
| Sign-ups | Yes | `users` | **Yes** (admin list) | — |
| Uploads, analyses, failures | Yes | `tenders` | Yes | — |
| Automatic vs manual starts | Yes, since 29 Oct | `tender_events` + `metric bidpilot_auto_analysis` | Yes (events by company) | One day of data |
| Repeat use | Derivable | `tenders` per company and day | Yes | Not in any report yet |
| Plan interest ("Choose plan" clicks) | **No** | — | — | The mailto click isn't recorded |
| Payments | Partly | `subscriptions`, written by hand | Yes | Payment itself is off-system |
| Reasons for not buying | No | — | — | Needs asking |

### 2.4 Baseline (read-only production query, 29 Oct 2026, India dates)

| Metric | Period | Count | Founder/test treatment | Known limitations | Confidence |
|---|---|---|---|---|---|
| Visitor-days | 12–29 Oct | 155 | **Included** (can't be excluded) | No cookies; daily-reset visitor ID; founder visits inflate it | Medium (overstated) |
| Visitors from google.com | last 30 days | 15 | Included | Referrer-based | Medium |
| Organic entry page that converts to visits | last 30 days | EMD guide: 7 journeys from Google | Included | Small numbers | Medium |
| External sign-ups | since 21 Sep (all time) | **3** | Excluded | — | High |
| External companies that uploaded | all time | **3** (5 tenders) | Excluded | — | High |
| External completed first analyses | all time | **3** (3 of 5 uploads; the other 2 waited for the Analyze click, before v52) | Excluded | — | High |
| External companies with a second analysis | all time | **0** | Excluded | — | High |
| External companies active on 2+ days | all time | **0** | Excluded | — | High |
| Paid conversions | all time | **0** | Excluded | Manual activation only | High |
| Automatic-analysis requests | since 29 Oct | 1 (tester account) | Founder test | One day | High |
| Search impressions and clicks | — | **[U]** | — | Needs Search Console | — |

**Manual checks only the founder can do (Search Console, 15 minutes):**
1. Performance → Search results, last 28 days: total impressions, clicks, average position. Then filter queries that don't contain "tendertez" to get the non-brand figure.
2. The Pages tab: which URLs get impressions, especially the 3 guides, `/sample-analysis`, `/tender-consultants` and the state lists.
3. Indexing → Pages: how many of the 58 sitemap URLs are indexed, and the reasons for those that aren't.
4. Search appearance: any "AI Overview" or other generative-feature filter that GSC offers in the account. If none, note "not available".
5. Bing Webmaster Tools: whether the site is verified. If it isn't, add it free with the same sitemap.

---

## Deliverable 3: Indian market and competitor assessment

### 3.1 Segments

| Segment | Tender work and frequency | How they read PDFs today | Free alternatives | Can pay recurring? | Discovery channels | Self-serve vs help |
|---|---|---|---|---|---|---|
| A. Independent tender consultants | Many bids a month across clients; paid ₹500–₹2,500 per bid or ₹5,000–₹15,000/month retainers [V: [Classic Tenders](https://classictenders.com/tender-bidding), [Professional Utilities](https://professionalutilities.com/bidding-on-gem-portal.php)] | Manually, with own checklists [H] | ChatGPT, own templates | Yes in principle, but a ₹400-per-tender cost is 16–80% of a ₹500–₹2,500 fee [H, from V figures] | Google, IndiaMART, GeM forums, LinkedIn [H] | Self-serve tool, own service |
| B. Small consultancy firms | Higher volume; staff executives; also sell GeM registration and listing [S: TenderDekho services] | Staff reading | Same | Yes; tool cost vs staff time | Same | Self-serve |
| C. Small contractors and suppliers (works) | Few to several tenders a month; long works tenders with eligibility tables [H] | Owner or one executive reads | Consultants, ChatGPT | Some; sensitive to price | Search, peers, consultants | Hybrid: tool plus help |
| D. GeM sellers and service providers | Many small bids; GeM bid documents plus ATC; over 11 lakh MSE sellers registered [S: [newsonair](https://www.newsonair.gov.in/gem-registers-11-lakh-mse-sellers-secures-over-%e2%82%b97-lakh-crore-in-orders)] | GeM's own forms; ATC read for exceptions [S: [BidAssist on ATC](https://bidassist.com/blogs/what-is-atc-in-gem-practical-use-of-atc-gem-documents/150160)] | GeM's own AI chatbot (reported, not verified); ₹199–₹399 tools | Low per-bid value; anchored by ₹199–₹399 tools [H] | Google, YouTube, GeM training, WhatsApp groups [H] | Strong service demand: registration, listing, bid help [S] |
| E. MSMEs bidding occasionally | Occasional; experience and turnover criteria the main barrier [S: [TenderDekho](https://tenderdekho.com/blog/build-tender-track-record-india-guide-2026)] | Owner reads, or hires a consultant per bid | Consultant, ChatGPT | Unlikely monthly; maybe per tender [H] | Search, associations | Help preferred [H] |
| F. Larger bid teams (EPC, PSU suppliers) | Continuous; large documents | Teams, enterprise tools (QuickBid, BidShakti, Tenderbook) [V] | Internal processes | Yes, via procurement and demos | Sales-led | Sales-led; not a fit for a self-serve founder now |

Evidence quality is mostly vendor and job-board material. **No first-hand user discussions were found** (searches of Reddit and forums found none). Segment needs and willingness to pay therefore remain hypotheses until real users tell or show us.

### 3.2 Competitors (public pages, 30 Oct; claims unverified)

| Product | Target | Primary job | AI document analysis | Published price | Trial | Sales contact? |
|---|---|---|---|---|---|---|
| [Tender Sahayak AI](https://tendersahayakai.com/) | MSMEs, GeM sellers | GeM search, analyser, alerts, workspace | "Tender Analyzer … ~15 sec" | ₹399 / ₹999 / ₹4,999 a month (launch offer); analyses per plan not stated | "Starter free to try" (contradicts the ₹399 shown) | No |
| [Tenderbook](https://www.tenderbook.in/) | Contractors, suppliers, consultants | Discovery + AI synopsis + competitor data | AI synopsis, fit score | **₹199 per tender** (documents + synopsis); annual from ₹2,499 (+GST) | "Start free" | No |
| Tenders Agent ([GetApp](https://www.getapp.com/all-software/a/tenders-agent/)) | Bidders, consultants | Discovery + extraction | Eligibility, EMD, deadlines | ₹2,999/year; free plan of 3 AI summaries a month (directory summary; page returned 403) | Free plan | No |
| [QuickBid](https://quickbid.co.in/) | MSMEs to enterprises | Full bid workflow | Go/no-go, risks, OCR | Usage coins; no amounts | No; demo | **Yes** |
| [TenderDekho](https://tenderdekho.com/) | GeM sellers | Discovery, competitor data, GeM services | Not on home page | Not shown | Free alerts | Consultancy form |
| BidShakti ([SaaSworthy](https://www.saasworthy.com/product/bidshakti)) | Contractors, consultants | Analysis + bid preparation, go/no-go | Yes | Not found | — | — |
| Minaions, Bid India, TendersGo | Various | Discovery + AI | Yes [V] | Not published | — | Demo |
| BidAssist ([App Store](https://apps.apple.com/us/app/id1374525306)) | All bidders | Discovery, documents | No | Pay per tender (US$3.99 in-app) + subscriptions | — | No |
| Substitutes | — | ChatGPT; a consultant per bid; in-house executive | — | ChatGPT Go ~₹399/month [S, 16 Oct notes] | — | — |

**Why a customer might choose an alternative over TenderTez:**
1. **Price.** A comparable AI synopsis costs ₹199 per tender or ₹399 a month elsewhere [V], against ₹3,999 a month here.
2. **One tool for discovery plus documents plus competitor history.** Tenderbook, Tender Sahayak AI and TenderDekho bundle what bidders look for first: finding tenders and seeing who won.
3. **Done-for-me service.** Many GeM sellers want registration, listing and submission done for them [S: TenderDekho and consultants' services]. TenderTez gives them a reading of the document, not a submitted bid.
4. **Familiar brands and reviews.** TenderTez has no reviews, no directory presence, and an unknown brand.

**Why a customer might prefer TenderTez:**
1. **Verifiable output.** Every point carries its page number and quoted text, and the sample analysis is public and unedited. Most competitors show no sample [M/S].
2. **Consultant workspaces.** A profile per client firm and checks against the right client. No competitor advertises this publicly [S].
3. **A checklist built only from the tender's own requirements, a corrigendum check that quotes the changed text, and annexure drafts that never invent values** [M]. These matter to people judged on not being rejected on form.
4. **Published prices and no sales call** (shared with Tenderbook and Sahayak).

**Recommended position:** *verifiable tender reading for people who check tenders for a living*, meaning consultants and bid executives. Compete on **trust and reviewer productivity** (page-linked evidence, a profile per client), **not on discovery and not on price**. Two consequences:
- Don't build discovery features to catch up.
- The ₹3,999 price must be justified against an executive's or consultant's time, not against ₹199 tools. If that justification fails with real users, pricing is the problem to test, with the founder's approval.

---

## Deliverable 4: Ranked search opportunities (15 clusters)

No free source gives reliable Indian search volumes. **No volumes or difficulty scores are given.** "Evidence" means what ranks today (US-index web search, 24 and 30 Oct) and TenderTez's own visit data. Search Console will replace this guesswork.

| Rank | Query family | Intent | Segment | Evidence | Who ranks | Page type (existing / new) | Conversion | Priority / confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | EMD exemption MSE / startup / GeM; "how to claim EMD exemption" | Informational, close to a bid | D, E, C | **The only TenderTez page with Google entries (7 in 30 days)** [M] | 2026 vendor blogs (TenderDekho, Nexizo, TendersPlus), court orders, bid PDFs [S] | Existing guide: strengthen (worked GeM example, current rule dates) | "Check a tender's EMD terms": upload | High / medium |
| 2 | How to check eligibility criteria in a tender; PQR; turnover; similar work | Informational, has a tender | A, B, C | SERP is sample PDFs and vendor guides [S] | Buyers' PDFs, TenderDekho 2026 guide, Nexizo | Existing guide: add turnover and similar-work sections (absorbs ranks 11–12) | Upload a tender, check against profile | High / medium |
| 3 | GeM bid document / ATC: how to read; ATC kaise padhe | Informational, has a bid PDF | D | The search returned a Hinglish answer from BHEL, POWERGRID and BidAssist documents [S]; Hinglish demand plausible | BidAssist explainer, buyers' ATC PDFs | **New** guide (English), with a short Hinglish section as a test | Upload the GeM bid PDF | High / low–medium |
| 4 | Documents required for government tender; submission checklist | High intent | C, D, E | 24 Oct: SPMCIL and CIPET checklists ranked [S] | Buyers' PDFs, BidAssist checklist blog | Section in the eligibility guide plus a checklist explainer; no separate page yet | "Get the checklist for your tender" | High / medium |
| 5 | Why GeM bid rejected; disqualification reasons | Informational, problem-aware | D, C | TenderShark post ranks [S] | Vendor blogs | New guide only if GSC shows impressions | Upload before bidding | Medium / low |
| 6 | AI tender analysis software India; tool to read tender PDF | Commercial | A, B, F | Directories win (GetApp, Capterra: Tenders Agent; SaaSworthy, SourceForge: BidShakti) [S] | Directories | Directory listings (G2 *product* profile, free) + one fair comparison page | Free trial | High (commercial) / medium |
| 7 | Can ChatGPT read tender documents; ChatGPT vs tool | Comparison | A, C | No good answer found [S] | Vendor pages | New page "ChatGPT vs TenderTez on a real tender" with a reproducible method | Try the same tender | Medium / medium |
| 8 | Tender software for consultants; multiple clients | Commercial | A, B | Slashdot, Capterra list tools; no multi-client page found [S] | Directories | Existing `/tender-consultants` | Free trial | Medium–high / medium |
| 9 | Tender analysis price; cost per tender | Commercial | All | Competitors publish ₹199–₹399 [V] | Vendor pages | Existing pricing page; explain per-tender value honestly | Free trial | Medium / medium |
| 10 | Tender corrigendum: what changed | Informational | A, B | Existing guide; no GSC data | TenderDetail, CPPP help | Existing guide | Corrigendum check | Medium / low |
| 11 | Turnover calculation for tender eligibility | Informational | C, A | Not run on 30 Oct | — | Section of the rank-2 guide | — | Medium / low |
| 12 | Similar work experience meaning | Informational | C | BHEL bid wording seen [S] | Buyer PDFs | Section of the rank-2 guide | — | Medium / low |
| 13 | Bid security declaration vs EMD | Informational | All | DoE circulars rank [S] (lesson 27: check dates) | Government circulars | Section of the EMD guide | — | Medium / low |
| 14 | Make in India Class I local supplier | Informational | D, C | Buyer PDFs rank [S] | PSU PDFs | Later guide (needs the order read to the end) | — | Low / low |
| 15 | Free government tenders by state | Free-information seekers | All | 42 live state lists; 30 visitors in 30 days [M] | Aggregators | Existing lists: maintain, **don't expand** | Weak | Low / medium |

**Distinct pages warranted now:** one new guide (rank 3). Ranks 4, 11, 12 and 13 fold into the existing guides. Ranks 6–7 are a comparison page plus directory listings. Everything else waits for Search Console data.

**Hindi and Hinglish:** the evidence is plausible demand only (a Hinglish answer surfaced for "ATC kaise padhe"), with no volumes. Test with one Hinglish section; **don't translate the site**.

---

## Deliverable 5: SEO and GEO backlog

| # | Item | Problem it solves | Impact | Confidence | Effort | Cost | First signal |
|---|---|---|---|---|---|---|---|
| S1 | Fix the layout shift on `/sample-analysis` (0.61) | The proof page is visually unstable on phones | High (trust, Core Web Vitals) | High (measured) | Low–medium | ₹0 | Days (Lighthouse), weeks (GSC Core Web Vitals) |
| S2 | Make "See a real analysis" a prominent home-page action (S1 first) | 4 sample visitors vs 125 home visitors | Medium–high | Medium | Low | ₹0 | 2 weeks |
| S3 | Search Console baseline, plus Bing Webmaster | No query or index data | Enables everything | High | Low (founder, 30 min) | ₹0 | Same day |
| S4 | Strengthen the EMD guide (the only page earning organic visits): worked GeM example, current dates, upload prompt | Converts existing traffic | Medium | Medium | Low | ₹0 | 2–4 weeks |
| S5 | New GeM bid document / ATC guide (English + Hinglish section) | Rank-3 cluster | Medium | Low–medium | Medium | ₹0 | 4–8 weeks |
| S6 | G2 product listing (the founder was on the services form) plus one more free directory | Commercial queries are won by directories | Medium | Medium | Low (founder) | ₹0 | 2–6 weeks |
| S7 | `/register`: noindex, or a server-rendered summary | Thin indexed page | Low | High | Low | ₹0 | Weeks |
| S8 | Redirect the fly.dev host to tendertez.in (production setting; needs approval) | Duplicate host | Low | High | Low | ₹0 | Weeks |
| S9 | Don't call `/bidpilot/me` on public pages when signed out, or treat 401 quietly | Console error | Low | High | Low | ₹0 | Immediate |
| S10 | ChatGPT vs TenderTez page with a reproducible method | Comparison queries; GEO citation material | Medium | Low–medium | Medium | ₹0 | 4–8 weeks |
| S11 | Monthly GEO check: the same 10 questions in ChatGPT, Perplexity and Gemini (logged out); log citations in `marketing/analytics/geo-citation-log.csv` | No AI-visibility measurement | Measurement only | Medium | Low | ₹0 | Monthly |

**GEO notes.**
- What helps both search and AI answers: direct first-sentence answers, cited and dated sources, the unedited sample as original evidence, a stated method, and consistency between what pages claim and what the product does. Server rendering (already done) is what makes pages readable to AI crawlers.
- `llms.txt` is not a Google ranking factor; keep it, but expect nothing from it.
- AI referrals are measurable only partly, through referrer hostnames in the visit counter (chatgpt.com, perplexity.ai and similar). There is no reliable way to count total AI citations, so don't claim one.

---

## Deliverable 6: Indian audience positioning

**Positioning statement (proposed, not implemented):**

> For tender consultants and bid teams who must not miss a condition,
> TenderTez reads a government or PSU tender and shows every requirement
> with the page it came from, checked against the right company's profile,
> so you can verify a tender in minutes instead of re-reading it.

**Home-page direction:**
1. Lead with *verifiable* rather than *AI*. The hero preview should show a real page-linked excerpt from the public sample, not invented values.
2. Put the sample analysis next to the main call to action.
3. Add one "for consultants" path above the fold. It exists today only as a card.
4. Keep tender search below the fold, as a free tool rather than the headline.

**Trust building (in order):**
1. A stable sample page (S1).
2. A plain section on how documents are handled, linked from the upload area. The privacy policy already covers this.
3. "What it can't do", already on the consultants page; repeat it on home.
4. Real reviews from real users only, when they exist. Never write them.

**Don't:**
- add guarantee language;
- change prices or the trial;
- translate the site;
- add a demo video before the sample page is fixed.

A short screen recording may come later if users ask "how does it work".

---

## Deliverable 7: Product-market validation plan

Baseline used for every threshold: about 3 external activations in 5 weeks, 0 repeat, 0 paid. The thresholds are directional; tiny samples prove nothing statistically.

| H | Hypothesis | For | Against | Missing | Low-cost test | Metric | Minimum evidence | Decision rule |
|---|---|---|---|---|---|---|---|---|
| H1 | Real demand for help reading tender PDFs | Tender-executive jobs; consultants' fees; 8+ vendors [S/V] | No first-hand user voices found | Users describing the pain unprompted | Ask each activated user one question: "What took you longest on your last tender?" | Answers that name reading or eligibility | 5 of 10 answers | If fewer than 3 of 10 mention reading: reposition toward what they name |
| H2 | Organic and low-cost channels bring qualified users | EMD guide earns Google visits [M] | 15 Google visitors in 30 days [M] | GSC impressions | S3, S4, S5 for 6–8 weeks | Non-brand clicks to guides; sign-ups from them | ≥ 150 non-brand clicks/month by week 8 | If under 50 by week 8: SEO is a long-term bet; lean on partnerships |
| H3 | Qualified visitors sign up and upload | 3 of 3 sign-ups uploaded [M] | 21 of 152 visitor-days reached /register [M] | Qualified-traffic denominator | Partnership session + sample-page fix | Upload rate among session attendees | ≥ 30% of attendees upload | If under 10%: trust or relevance problem |
| H4 | Users complete their first analysis | 3 of 3 companies did; v52 removes the click [M] | 2 uploads stalled before v52 | Post-v52 data | Watch auto-start outcomes | completed first ÷ companies that uploaded | ≥ 80% over ≥ 10 companies | If under 60%: inspect failures and refusals |
| H5 | Users return with more tenders | — | **0 of 3 returned** [M] | Why not | Ask the 3 (and every new activator at day 7) whether they've had another tender since | Companies with a 2nd analysed tender within 30 days | ≥ 3 of the first 10 activators | **If 0–1 of 10: value or recurrence problem; stop acquisition work and fix the product or segment** |
| H6 | Recurring users pay current prices | — | 0 paid; competitors far cheaper [V] | Any price reaction | When a user starts a 4th or 5th trial tender, offer the plan explicitly and record the answer | Paid ÷ trial-exhausted companies | ≥ 1 paid of the first 5 trial-exhausted | If 0 of 5 with "too expensive" reasons: test a per-tender pack (founder approval) |
| H7 | Consultants have a stronger recurring need than occasional bidders | Fees per bid; client workspaces [S/M] | One consultancy declined [M] | Repeat rate by segment | Tag each activator's segment (one sign-up question, or ask) | 2nd-tender rate, consultants vs others | ≥ 5 per group | If consultants repeat 2× more: focus all copy on them |
| H8 | Price and scope beat free alternatives and manual work | Page-linked output; sample is real [M] | ₹199 synopsis, ₹399/month tools [V] | Users' own comparison | Ask users who decline what they'd pay and what they use instead | Stated reason + whether they then pay | 5 declines with reasons | If most cite price: per-tender pack test; if they cite "ChatGPT is enough": comparison proof (S10) |

**How to tell distribution, product and market problems apart:**
- **Distribution problem:** fewer than about 50 qualified people reached the product in 30 days, so no conclusion about demand is possible.
- **Activation problem:** qualified people arrive but under 30% upload.
- **Product or value problem:** they analyse, but fewer than 2 of 10 come back.
- **Pricing mismatch:** they come back, but 0 of 5 trial-exhausted users pay, with price as the stated reason.
- **Market problem:** all of the above fixed across two segments and still no repeat use or payment.

**Provisional 60-day decision points:**
- **Continue:** ≥ 10 external first analyses, ≥ 3 repeaters and ≥ 1 paid.
- **Change segment:** repeaters come only from one segment, so move all effort to it.
- **Reconsider the model:** ≥ 10 first analyses, 0–1 repeaters and 0 paid. Then consider per-tender pricing, a service bundle, or a different job (for example, bid-desk checking for consultants).

Revise these thresholds if the partnership session can't happen (the denominator would be too small).

---

## Deliverable 8: Thirty-day execution plan (no paid tools)

| Days | Task | Who | Priority | Outcome | Effort | Depends on | Cost | Measure | Done when |
|---|---|---|---|---|---|---|---|---|---|
| 1–3 | GSC + Bing baseline (D2 manual checks) | Founder | P0 | Query/index baseline | 30 min | GSC access | ₹0 | Numbers recorded | Table filled |
| 1–3 | Weekly external-only report (D9) running | Claude | P0 | Clean funnel each week | 2 h | — | ₹0 | Report produced | First report out |
| 1–3 | Ask the 3 activated companies the two questions (H1, H5) | Founder (3 messages; warm users) | P0 | Why no second tender | 30 min | — | ₹0 | Answers logged | 3 sent |
| 4–7 | Follow up the MSME association for a members' session (already positive) | Founder (one email; draft ready) | P0 | Date agreed | 1 h | — | ₹0 | Session booked | Date in calendar |
| 4–7 | Competitor and keyword research refresh from GSC queries | Claude | P1 | Clusters re-ranked with real data | 2 h | GSC numbers | ₹0 | — | Ranked list updated |
| 8–14 | Fix the sample-page layout shift (S1); make the sample prominent (S2) | Claude, after approval (code) | P0 | Stable proof page | 0.5–1 day | Approval | ₹0 | Lighthouse shift < 0.1 | Deployed after "deploy" |
| 8–14 | Strengthen the EMD guide (S4) | Claude drafts; founder approves | P1 | Better conversion of existing traffic | 0.5 day | Approval | ₹0 | Guide → upload clicks | Published after approval |
| 8–14 | G2 product listing + one directory (S6) | Founder | P1 | Presence where tool queries land | 1 h | — | ₹0 | Listing live | Listed |
| 15–21 | Members' session (live demo on members' own tenders) | Founder | P0 | Qualified uploads | 2 h | Session booked | ₹0 | Attendees, uploads, analyses | Held |
| 15–21 | GeM ATC guide draft (S5) | Claude drafts; founder approves | P2 | Rank-3 cluster | 1 day | Approval | ₹0 | — | Draft approved |
| 15–21 | 2 LinkedIn page posts from real (anonymised) analysis findings | Founder posts | P2 | Consistent presence | 1 h/week | — | ₹0 | Profile visits, clicks with `utm_source` | Posted |
| 22–30 | Day-7 check-ins with every new activator (H5) | Founder | P0 | Repeat and price reasons | 15 min each | Activators | ₹0 | Answers logged | All asked |
| 22–30 | Decision review against D7 thresholds | Founder + Claude | P0 | Continue, change segment, or rethink | 1 h | All above | ₹0 | — | Memo written |

- **A. Now:** report set-up; research refresh once GSC numbers exist; drafting the guide and the email.
- **B. Founder approval:** any code change or deploy (S1, S2, S7, S9); content publication; the session email; any pricing test.
- **C. External accounts:** Search Console, Bing, G2 and directories, LinkedIn page.
- **D. Not yet:** paid ads, Hindi site, new features, programmatic pages, a video, more state pages.

---

## Deliverable 9: Measurement dashboard (weekly, India dates, Monday–Sunday)

| Section | Metric | Definition | Source | Founder excluded? |
|---|---|---|---|---|
| Acquisition | Non-brand clicks / impressions | GSC queries without "tendertez" | GSC (manual) | n/a |
| Acquisition | Qualified landing visits | Visitor-days entering on guides, sample, consultants, pricing | `page_views` | **No** (disclose) |
| Acquisition | Referrals by source | Referrer host, incl. chatgpt.com, perplexity.ai, gemini.google.com | `page_views` | No |
| Activation | External sign-ups | New users not in the admin list | `users` | Yes |
| Activation | First uploads | Companies whose first upload is this week | `tenders` | Yes |
| Activation | Completed first analyses | Of those, first tender COMPLETED | `tenders` | Yes |
| Activation | Auto-start outcomes | started / refused (by reason) / error | `tender_events`, logs | Yes |
| Retention | Second analysis within 7 / 14 / 30 days | Companies with a 2nd COMPLETED tender | `tenders` | Yes |
| Retention | Analyses per active company | COMPLETED ÷ companies with ≥ 1 that week | `tenders` | Yes |
| Revenue | Paid conversions; MRR | New ACTIVE paid subscriptions; sum of plan prices | `subscriptions` | Yes |
| Revenue | Reasons for not buying | Logged answers | CRM notes | n/a |
| GEO | Citation log | 10 fixed questions × 3 engines, monthly, logged out | `geo-citation-log.csv` | n/a |

**Report format:** each line shows "count (denominator), period, and whether the founder is excluded". Write "too few to judge" whenever the denominator is under 10. Don't report percentages on fewer than 10.

---

## Deliverable 10: Decision memo

**DO NOW (max 5):**
1. Book the MSME association members' session (warm, one-to-many, real tenders).
2. Ask the 3 activated companies why there was no second tender, and what took longest on their last tender.
3. Record the GSC + Bing baseline (D2 manual checks).
4. Approve the fix for the sample-page layout shift and make the sample prominent on home.
5. Start the weekly external-only report (D9).

**DO LATER:**
- the EMD guide refresh;
- the GeM ATC guide with a Hinglish section;
- the G2 product listing;
- the ChatGPT comparison page;
- `/register` noindex;
- the fly.dev redirect;
- the 401 clean-up;
- a short demo recording;
- a per-tender pricing test (approval needed, and only if H6 fails on price).

**DO NOT DO:**
- paid ads or paid SEO/GEO tools;
- mass content or programmatic pages;
- translating the site;
- more state landing pages;
- discovery features to match aggregators;
- cold WhatsApp or bulk messages;
- buying directory placements or reviews;
- claims of guaranteed eligibility or accuracy;
- treating visitor counts or stated interest as demand.

**Three assumptions that could invalidate this plan:**
1. **Bidders value verifiable reading enough to pay separately for it.** Competitors at ₹199–₹399 suggest the market may price it as a commodity.
2. **Consultants are customers rather than competitors.** One already said it is building its own; consultants may prefer to own the tool.
3. **Recurring use exists for one segment.** If no segment analyses a second tender within 30 days, no acquisition channel can fix the business.

---

### Sources (accessed 30 Oct 2026)

- Competitors:
  - [Tender Sahayak AI](https://tendersahayakai.com/)
  - [Tenderbook](https://www.tenderbook.in/)
  - [QuickBid](https://quickbid.co.in/)
  - [TenderDekho](https://tenderdekho.com/)
  - [Tenders Agent on GetApp](https://www.getapp.com/all-software/a/tenders-agent/)
  - [Tenders Agent on Capterra India](https://www.capterra.in/software/1111993/Tenders-Agent) (403; price taken from the search summary)
  - [BidShakti on SaaSworthy](https://www.saasworthy.com/product/bidshakti)
  - [BidAssist on the App Store](https://apps.apple.com/us/app/id1374525306)
  - [Slashdot tender management India](https://slashdot.org/software/tender-management/in-india/)
- Consultant fees: [Classic Tenders](https://classictenders.com/tender-bidding), [Professional Utilities](https://professionalutilities.com/bidding-on-gem-portal.php)
- GeM statistics: [newsonair](https://www.newsonair.gov.in/gem-registers-11-lakh-mse-sellers-secures-over-%e2%82%b97-lakh-crore-in-orders), [IANS](https://ianslive.in/gem-hits-rs-18-lakh-crore-gmv-mark-mses-account-for-68-pc--20260406164235). The PIB original was not opened.
- Job listings: [apna Noida](https://apna.co/job/noida/tender-executive-818053311), [apna Surat](https://apna.co/job/surat/tender-executive-449824952)
- Search evidence:
  - [TenderDekho eligibility guide](https://tenderdekho.com/blog/how-to-read-government-tender-document-india-guide-2026)
  - [Nexizo eligibility guide](https://nexizo.ai/blogs/eligibility-criteria-for-government-tenders-in-india-a-complete-guide)
  - [BidAssist ATC explainer](https://bidassist.com/blogs/what-is-atc-in-gem-practical-use-of-atc-gem-documents/150160)
  - [TendersPlus EMD](https://tendersplus.com/blogs/emd-exemption-for-msme-startups)
  - [TenderDekho track record](https://tenderdekho.com/blog/build-tender-track-record-india-guide-2026)
- TenderTez data: read-only production queries and the visits report (29 Oct); Lighthouse 12.2.1 local runs (30 Oct); live page fetches (30 Oct).
