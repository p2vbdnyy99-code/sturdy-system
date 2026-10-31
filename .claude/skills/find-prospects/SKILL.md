---
name: find-prospects
description: >-
  Finds new Indian businesses with public, verifiable evidence of government
  tender activity (tender consultants, contractors, GeM sellers, suppliers),
  checks duplicates and earlier contacts, scores them from the evidence and
  saves them to the TenderTez CRM with source URLs. Never guesses contact
  details. Use when the user says "find prospects", "find leads", "more
  customers to contact", or runs /find-prospects [segment] [count].
argument-hint: "[segment, e.g. consultants | civil | electrical | medical | it | gem] [count, default 10]"
---

# /find-prospects

Work from `marketing/automation`. Rules: `marketing/leads/lead-scoring-rules.md`
and `CLAUDE.md`. Quality over volume: 10 verified prospects beat 100 guesses.

## Sources (public only)

- **Consultants:** search "tender consultant <city>", "GeM consultant <city>",
  "bid preparation services <city>"; open the firm's **own website** and its
  contact page.
- **Contractors and suppliers:** CPPP "results of tenders"
  (https://eprocure.gov.in/cppp/resultoftendersnew/cpppdata) lists awarded
  bidders; then find the bidder's own website. Public PSU/ministry award
  notices. Association member directories that are public.
- **LinkedIn company pages** (public view) for size and city only.
- IndiaMART listings are leads only (it rate-limits readers); confirm on the
  business's own site before saving a contact.

Never: private or login-only groups, scraping tools for LinkedIn/Facebook,
IREPS (robots forbids), captcha pages, guessing addresses, personal phone
numbers, more than a handful of pages per site.

## Steps

1. `python3 -m ttm prospects` and `python3 -m ttm status`: know who is already
   there and how many `contacted_before` entries exist.
2. Research the segment. For each candidate, open the evidence page yourself.
3. Build JSON per prospect: `company`, `website`, `category` (one of the CRM
   categories), `location`, `source_url` (page with the evidence), `evidence`
   (what the page says, briefly, in your words or a short quote), `signals`
   (only those the evidence supports), `use_case`, optional `public_contact`
   **only if it is published**, with `contact_source_url`, and `verified: true`
   only if you opened the business's own page.
4. Save: `python3 -m ttm prospect-add @/tmp/batch.json`. Duplicates, opt-outs
   and businesses already contacted are refused: report them, don't work around it.
5. For tier A prospects with a public business email, draft a first message
   from `marketing/leads/outreach-templates.md` that opens with the real
   observation, and record it: `python3 -m ttm stage <id> draft --channel email --message "…"`.
   Optionally create a **Gmail draft** (never send).
6. Report: saved (with tier and why), skipped (with reason), and the drafts
   waiting for approval. Keep the list in chat; never commit prospect data.
