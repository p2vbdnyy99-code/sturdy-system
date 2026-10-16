# KPI definitions

Each KPI says where its number comes from. If the source has no record, the
report says "not available"; nothing is estimated.

| # | KPI | Definition | Source |
|---|---|---|---|
| 1 | Qualified prospects identified | New CRM prospects in tier A or B (score ≥ 40), excluding imports | `ttm report` (events `prospect_saved`) |
| 2 | Prospects contacted | First messages + follow-ups recorded as sent | `ttm stage <id> contacted / followed_up` |
| 3 | Positive replies | Replies recorded with sentiment `positive` | `ttm stage <id> reply --sentiment positive` |
| 4 | Demos or trial sessions | Calls or guided runs held | `ttm stage <id> demo` |
| 5 | First successful tender analyses | Prospect analysed a tender in the product; site-wide: tenders analysed | `ttm stage <id> activated`; `visits-report.mjs` |
| 6 | Trial-to-paid conversion | Paid ÷ activated (cumulative) | CRM stages |
| 7 | Paying customers | Companies with an ACTIVE subscription | `subscription.mjs status` (production, read-only) and `ttm stage <id> paid` |
| 8 | MRR (₹) | Sum of active monthly plan prices | `subscription.mjs status` × `plans.js` prices |
| 9 | CAC (₹) | Money spent on acquisition ÷ new paying customers. At ₹0 spend it is ₹0 cash; founder time is not counted unless recorded | founder |
| 10 | Retention | Paying customers who renew the next month | `subscription.mjs status` month on month |

Site numbers (visitors, sign-ups, analyses, paid plans) are recorded weekly
with `ttm site-metrics --week-ending … --source …`.

## UTM convention

The site stores only `utm_source` (as `page_views.campaign`, up to 40
characters of `a-z 0-9 . _ -`), so it carries channel and campaign:

`https://tendertez.in/<page>?utm_source=<channel>.<campaign>&utm_campaign=<campaign>`

- channel: `linkedin`, `x`, `facebook`, `reddit`, `whatsapp`, `email`, `youtube`
- campaign: a short slug, e.g. `emd_exemption`, `consultants_oct26`

`ttm draft` and the MCP tools add these automatically to tendertez.in links
that don't have a `utm_source` yet. `visits-report.mjs` lists visitors per
`utm_source` under "Campaigns". Sign-ups are not yet attributed to a campaign
in the product (a possible small change: store the first `utm_source` on the
company at sign-up; founder approval needed).
