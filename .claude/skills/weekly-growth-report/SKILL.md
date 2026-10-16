---
name: weekly-growth-report
description: >-
  The TenderTez weekly growth report from verified data only: qualified leads,
  contacts, replies, demos, first analyses, paid conversions, revenue and
  channel performance from the CRM, the content queue and production's own
  visit and subscription reports, with what to stop, continue and improve.
  Missing metrics are labelled, never invented. Use when the user says
  "weekly report", "how did marketing do", or runs /weekly-growth-report.
argument-hint: "[week ending YYYY-MM-DD, default today]"
---

# /weekly-growth-report

## Steps

1. **Production numbers (read-only).** Run in the Fly machine as in
   `OPERATIONS.md`: `node scripts/visits-report.mjs 7` and
   `node scripts/subscription.mjs status`. Never print emails or tokens; record
   only counts:
   `cd marketing/automation && python3 -m ttm site-metrics --week-ending <date> --source "visits-report.mjs 7d; subscription.mjs" --visits N --visitors N --signups N --first-analyses N --paid-plans N`.
   If you can't reach production, say so and leave them "not available".
2. **Engagement.** Ask the founder for numbers shown on LinkedIn/X for posts
   published this week, and record them with `python3 -m ttm metrics <id> …`.
   Don't guess.
3. **Report.** `python3 -m ttm report --end <date>` (markdown) and
   `python3 -m ttm dashboard`.
4. **Commentary**, clearly labelled as recommendations:
   - **Continue**: channels or topics that produced replies, demos, first
     analyses or payments (not likes).
   - **Stop**: activity with no qualified response after a fair try (say what
     "fair" was: e.g. 20 messages or 6 posts).
   - **Improve**: the biggest drop in the funnel this week and one change to test.
   Compare with last week's numbers if recorded.
5. Give the report in chat. If the founder wants it shared, offer a Google Doc
   (shared with advayaicopilot@gmail.com) without prospect contact details.
