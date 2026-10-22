# Lead scoring rules

The score (0–100) is computed by `ttm` from the evidence signals the researcher
records, using `lead_scoring` in `marketing-config.json` (defaults in
`marketing-config.example.json`). The reason is stored with every prospect.

| Signal (record only with a source URL) | Points |
|---|---|
| `explicit_tender_consultancy`: the business advertises tender/bid preparation or filing | 35 |
| `government_tender_experience`: its site lists government or PSU clients or work | 25 |
| `public_award_evidence`: a public award notice names it (e.g. CPPP results of tenders) | 25 |
| `recent_tender_participation`: bid or award in the last 12 months, with a link | 15 |
| `gem_seller`: offers GeM services or is a GeM seller (public evidence) | 15 |
| `supplies_public_institutions`: publicly supplies hospitals, universities, PSUs | 15 |
| `discusses_tender_difficulty`: has publicly written about tender-reading problems | 10 |

| Category bonus | Points |
|---|---|
| tender consultant | 15 |
| procurement consultant | 10 |
| contractors and suppliers (civil, electrical, mechanical, medical, IT, pharma, GeM seller) | 5 |
| MSME supplier (general) | 0 |

A published business contact (email, phone or contact page, with the page it
was found on) adds 10.

Tiers: **A** ≥ 70 (draft a personal message now), **B** 40–69 (verify on the
business's own site first), **C** < 40 (keep for later; don't contact).

## Hard rules (enforced by the code)

- Company, category, evidence and the evidence's source URL are required.
- A contact must come with the public page it is published on. Never guess an
  address (no "info@" or "firstname@" guesses).
- Duplicates (same domain, same normalised name, same contact) are refused.
- Businesses that opted out, or were already contacted outside the CRM, are refused.
