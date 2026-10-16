---
name: seo-review
description: >-
  Audits the live TenderTez website (titles, descriptions, canonicals, sitemap,
  robots, broken internal links, alt text, indexing, speed), ranks issues by
  likely business impact, and makes only approved, safe fixes with tests. Use
  when the user says "SEO review", "check the website SEO", "why aren't we
  ranking", or runs /seo-review.
---

# /seo-review

Rules: `CLAUDE.md` (public pages in `PUBLIC_PAGES`, landing-page rules, no
doorway pages, structured data only states what pages state, strict CSP) and
`marketing/seo/`.

## Steps

1. **Measure.** `cd marketing/automation && python3 -m ttm seo-audit` (add
   `--json` for detail). Also time the home page and asset sizes with curl.
2. **Search Console.** If the founder has connected Search Console data, read
   clicks, impressions and queries per page. Otherwise say it is not available;
   don't estimate rankings or volumes.
3. **Rank issues** by business impact: pages that bring bidders to sign up
   (home, pricing, landing pages, search) before the rest. Compare with
   `marketing/seo/technical-audit.md` and note what changed.
4. **Propose fixes** with the file to change. Safe examples: a description,
   a title, a missing canonical, a broken link, server-rendered text for a
   public page. Larger ones (new pages, articles section, bundle splitting)
   go to the founder as proposals.
5. **Implement only what the founder approved**, following the harness
   (`harness/README.md`): plan, change, tests (`whatsapp-doc-assistant/scripts/verify.sh`),
   a browser check, docs in `BIDPILOT_ARCHITECTURE.md`. Live website changes
   are deployed only after the founder says "deploy".
6. **Update** `marketing/seo/technical-audit.md` with the new measurements.

Never: buy links, create doorway or mass-generated pages, add browser analytics
scripts, promise rankings.
