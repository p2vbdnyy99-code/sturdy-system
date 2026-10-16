# Structured data plan

Structured data states only what the visible page states (CLAUDE.md rule).
JSON-LD is served as a data block, which the strict CSP allows.

| Page | Today | Next |
|---|---|---|
| `/` | Organization, WebSite, SoftwareApplication | — |
| `/pricing` | SoftwareApplication offers (the three plans and the free trial) | — |
| `/faq` | none | `FAQPage` only if the questions and answers are in the server HTML (Google shows FAQ rich results only for some sites; it still helps other readers) |
| Landing pages | none | `ItemList` of the listed tenders is possible but low value; skip unless Search Console shows interest |
| Sample analysis (future) | — | `Article` with the date and the source tender's link |

Not used: Review/AggregateRating (no reviews), LocalBusiness (online-only),
anything claiming certifications.

GEO (AI search): keep `/llms.txt`, page descriptions, FAQ and pricing in sync
with the product; consistent company facts (name TenderTez, Mumbai, founder
Sayali Londhe, contact email) everywhere. Whether a given AI crawler reads the
site can only be checked from server logs (user agents) or by asking the AI
tool directly; don't assume it.
