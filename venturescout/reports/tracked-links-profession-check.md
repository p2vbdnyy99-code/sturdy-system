# #23 profession check: who asks "did they open it?" (2026-10-30)

Pass rule (set before the check): one vertical with **≥10 independent requests in the last 24 months**
(since 2024-10-30) **and no tool built for it**.

## Result: **no vertical passes.** One lead worth a further $0 check: QuickBooks Online estimates.

| Vertical | Requests found | Tools already built for it | Pass? |
|---|---|---|---|
| Freelancers (proposals) | Many Upwork forum threads, mostly 2017–2024; one r/Upwork 2026 snapshot | Upwork's own My Stats; Stacktree, PandaDoc, Better Proposals-type tools | No: served, and on-platform proposals can't carry your link |
| Real estate (listing packs) | None found on Reddit | Highnote, MLS listing-activity tracking | No: no demand evidence |
| Contractors (quotes) | Mike Holt / HeatingHelp forums complain about silence | QuoteIQ, TradeQuote, Jobber-type quoting tools log opens | No: served |
| Job seekers (resumes) | r/resumes threads (2024–2025) | TrackPDF, Visly, Presumi, Sumry | No: served; recruiters avoid tracked links; low willingness to pay (inference) |
| Tutors (worksheets) | None found | Canvas / LMS activity logs | No: no demand evidence |
| **QuickBooks Online users (estimates)** | **~11 threads, US/CA/AU/UK, 2021–2026** | Quotient, PandaDoc, Method, Prospero, but they **replace** QBO estimates | **Not yet**: only 2 confirmed inside the window |

## The QuickBooks lead

**The gap (Intuit's own answers):**
- 2021-05-04: "The option to know if a customer opened or viewed an estimate isn't yet available." Support suggested the
  Apps store for a third-party app. Later replies to 2023-09 say nothing changed.
- 2023-10-30: "QuickBooks Online does not have a built-in feature to track when a customer has opened an estimate."
- 2024-04-02 (AU, "quote"): "isn't yet available". The thread has 8 views.
- 2025-09-03: user says QBO removed view history; it no longer shows which recipient opened (user claim).
- 2026-04 (reported in search summary): QBO doesn't email you when a customer accepts an estimate.
- QuickBooks Mobile feedback forum: a request for the same feature with 21 votes (search summary, not opened).
- Invoices do show "Viewed"; estimates don't.

**Count against the rule:** ~11 related threads found, but only 2 have confirmed dates inside 2024-10-30..2026-10-30
(2025-09 and 2026-04). **Threshold not met on confirmed dates.** Several threads were not dated in this check.

**Why it's interesting anyway:**
- Built-in distribution: the Intuit App Store, and Intuit support itself tells users to look there.
- Global: QBO runs in the US, Canada, Australia, the UK and other countries.
- Narrow, clear job: "keep using QuickBooks estimates; tell me when the customer opened it, and when they accepted."

**Risks:**
- **Intuit can ship it.** It already tracks invoice views. This is the largest risk.
- Engagement is thin (8 views on one thread; 21 votes on the feedback forum).
- Technical: a third-party app can't see opens of Intuit's own estimate link. It would have to send the estimate itself
  as its own tracked link (pulling the estimate from the QBO API). That changes the customer's workflow.
- Intuit's developer terms and any API fees for App Store apps: **not checked**.
- Competitors already sell full quoting suites with view tracking; a small add-on must be much cheaper and simpler.

## Next $0 checks (in order; stop at the first fail)

1. Date every QBO estimate-view thread found and search for more. Pass = ≥10 inside 2024-10-30..2026-10-30.
2. Intuit App Store: does an app already do "estimate viewed / accepted" alerts? Pass = none, or only full quoting suites.
3. Intuit developer terms: can an individual publish, what fees apply to API use, and can an app email estimates
   on the user's behalf? Pass = allowed with costs known.
