# Social content audit and 4-week plan (16 Oct 2026)

The plan: `content-calendar-2026-10-19.csv` (12 LinkedIn + 16 X posts, 19 Oct to
14 Nov 2026). Every post is in the approval queue (`ttm queue`) as a draft;
nothing is posted until the founder approves and posts it. Built by checking
each draft against its cited sources and the product's own code.

## What was checked

- **Links:** every tendertez.in link rebuilt with `links.build_url` (standard
  `utm_source` / `utm_medium` / `utm_campaign`) and opened over the network:
  all answered HTTP 200 with no redirect.
- **Rules and numbers:** read in the cited primary documents:
  - GFR 2017 Rule 170 as revised by the Department of Expenditure OM of
    25 Jul 2017 (2% to 5%, MSE and startup exemption, 45 days).
  - The DoE OM on bid security of 12 Nov 2020.
  - The Ministry of MSME's FAQ on the MSE procurement policy.
  - The DPIIT Make in India order as revised on 19 Jul 2024.
- **Product claims:** matched against the Features and Pricing pages and the
  code:
  - BOQ items with pages (`analysis/schema.js`).
  - Corrigendum check, including changed conditions (`analysis/corrigendum.js`).
  - Client workspaces.
  - User-added checklist items (`checklist/custom` routes).
  - 5 free tenders with no card needed.
- **Lint:** `content.lint` for each platform (length, banned claims, sources,
  links). The longest X post is 277/280.

## Findings in the old calendar (29 rows: 11 LinkedIn, 13 X, 5 other)

| Finding | Rows | Fix |
|---|---|---|
| The 2020 DoE memorandum was presented as current practice. Its para 6 limits it to "tenders issued till 31.12.2021". | LinkedIn EMD exemption; LinkedIn Bid Security Declaration; Facebook EMD explainer | Rewritten to give the date limit and "the tender decides". |
| Make in India Class-II said "more than 20%"; the order says a minimum of 20%, and nodal ministries may set higher. Source was a news article. | X Make in India | Corrected; source is now the DPIIT order. |
| Secondary source (Vikaspedia) for the MSE policy. | X traders; LinkedIn L1+15% | Source is now the Ministry of MSME FAQ. Added its 25% cap. |
| "This week TenderTez added pages" is stale. | LinkedIn free search | Reworded. |
| "Answers bind the buyer" is a legal claim. | X pre-bid meeting | Softened. |
| Non-standard tracking (`utm_source=linkedin.topic`); the link checker did not catch it. | All posts with links | Links rebuilt. `links.check_url` now rejects a non-standard `utm_source` (tested). |
| Free-search X post had no link. | X free search | Link added. |

Classification of the 24 LinkedIn and X drafts:
- **Ready as written:** 9.
- **Ready after the link fix:** 8.
- **Corrected after source checks:** 7 (4 LinkedIn, 3 X).
- **Promotional:** 5 (workspaces, free search on LinkedIn and on X,
  corrigendum, checklist). The rest are educational, plus one engagement
  question.
- **X-adaptable LinkedIn posts:** turnover, BOQ and checklist. All three were
  added as X posts.
- **Unsuitable:** none.

The plan also adds one new LinkedIn post, on the public sample analysis.

The other 5 rows are not in the plan:
- **WhatsApp explainer:** one-to-one only.
- **Re-engagement email:** the same as outreach Template D.
- **Video script:** needs the founder's recording.
- **Facebook group post:** corrected; post by hand, only where the group's
  rules allow.
- **Blog outline:** needs an articles section, which is a site change and
  needs approval.

## Publishing path (evaluated, nothing connected)

- **Now (recommended):** the founder copies each post from the Google Doc and
  posts it, or uses LinkedIn's built-in post scheduling. This needs no new
  account, costs nothing, and the links stay direct. Then `ttm published <id>
  <url>`.
- **LinkedIn API:** posting as the founder needs a LinkedIn developer app with
  "Share on LinkedIn" and the founder's OAuth consent. That is an account
  action in the founder's name, so it needs approval. Not built.
- **X API:** posting needs a paid API plan, which is a charge, so it needs
  approval. Not built.
- **Third-party schedulers (Buffer, Typefully):** these need an account in the
  founder's name, so they need approval. No connector is attached to this
  workspace.
- **Never:** automated replies, DMs, likes or follows.
