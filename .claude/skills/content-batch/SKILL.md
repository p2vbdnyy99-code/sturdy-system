---
name: content-batch
description: >-
  Drafts a batch of useful, sourced, platform-specific TenderTez posts
  (LinkedIn, X, and where relevant WhatsApp, email, Facebook, Reddit, article
  outlines, video scripts) from real tender rules and real bidder problems, and
  stores them in the approval queue. Never publishes. Use when the user says
  "write posts", "content batch", "next week's content", or runs
  /content-batch [topic or count].
argument-hint: "[topic, or number of posts, default 6]"
---

# /content-batch

Work from `marketing/automation`. Read `marketing/brand-guide.md` (what we may
and may never say) and `marketing/content/content-calendar.csv` (what is
planned and already queued).

## Steps

1. **Pick topics** that answer a real bidder problem: objections in
   `marketing/research/customer-objections.md`, questions from replies,
   gaps in `marketing/research/keyword-research.md`, or a new rule. Avoid
   repeating a topic queued in the last 30 days (`python3 -m ttm queue`).
2. **Source every fact.** Find the primary source (GFR, Department of
   Expenditure OMs, GeM GTC or a GeM bid document, DPIIT orders, the tender
   itself) with WebSearch/WebFetch. No source, no number. Never use a real
   customer's tender or name.
3. **Write per platform** (don't paste the same text everywhere):
   - LinkedIn: 120–250 words, a hook naming the reader, numbered checks, the
     source line, one link to the most relevant tendertez.in page.
   - X: under 280 characters (links count 23), one idea, at most one link.
   - X thread: 4–6 posts when the topic needs steps.
   - WhatsApp: short, bulleted, for one-to-one sharing only.
   - Email newsletter item, article outline, 60-second video script, FAQ entry:
     use `content.adapt_topic` as a starting point if helpful.
4. **Queue** LinkedIn and X through the MCP tools (`draft_linkedin_post`,
   `draft_x_post`) or `python3 -m ttm draft …` with `--source` for each URL,
   `--date`, `--audience`, `--purpose`, `--kpi`. The queue rejects banned
   claims and unsourced numbers: rewrite, never bypass. Links get UTMs automatically.
5. **Add rows** for other channels to `marketing/content/content-calendar.csv`
   with `approval_status` "draft (not approved)".
6. **Report** what was queued (ids, dates) and what needs the founder to
   approve: `python3 -m ttm approve <id>`, then post by hand and record
   `python3 -m ttm published <id> <url>`.

Facebook and Reddit drafts only for communities verified in
`marketing/research/channel-research.md`, following their rules.
