---
name: marketing-daily
description: >-
  TenderTez daily marketing review. Reads the marketing workspace (CRM, content
  queue, follow-ups, approvals), checks replies in Gmail, and writes today's
  recommended actions for the founder. Never sends, posts or publishes. Use when
  the user says "marketing daily", "what should I do today for marketing",
  "daily growth check", or runs /marketing-daily.
---

# /marketing-daily

Work from `marketing/automation` (`cd marketing/automation`). Read
`marketing/README.md` and `marketing/brand-guide.md` first if they aren't in
context. Follow every rule in `CLAUDE.md`.

## Steps

1. **State.** Run `python3 -m ttm status`. If `kill_switch` is true, stop and
   report it. If `data/` is empty but a backup exists in the founder's Drive
   (search Drive for `tendertez-marketing-backup`), say so and ask before importing.
2. **Replies.** With the Gmail connector, search the inbox (`newer_than:3d -in:sent`)
   for replies from businesses in the CRM (`ttm prospects` gives domains and
   contacts) and from `contacted-before` entries. For each real reply:
   - Not yet in the CRM but in `contacted-before`: propose an import with
     `prospect-add --import-stage replied` (show the JSON; ask before saving).
   - In the CRM: propose `ttm stage <id> reply --sentiment …` with a one-line
     summary. An "unsubscribe", "no" or "stop" is an opt-out: record it.
   Never paste a reply's full text into a file in Git.
3. **Due today.** `python3 -m ttm follow-ups`, `python3 -m ttm prospects --stage drafted`,
   `python3 -m ttm prospects --stage approved`, `python3 -m ttm queue --status draft`
   and `--status approved`. List what is due today or overdue.
4. **Warm leads first.** Anyone at `replied`, `demo` or `activated`: write the
   next step for each (call, demo slot, help with a tender, a plan offer).
5. **One useful public item.** If time allows, look for one new, sourced fact
   for content (a DoE/GeM circular, a public tender rule) with WebSearch; add
   it as a note, not a post.
6. **Write the plan** as a short list in chat, most valuable first, and refresh
   the dashboard: `python3 -m ttm dashboard`. End with what needs the founder's
   approval.
7. **Back up** if anything changed: `python3 -m ttm export /tmp/tt-backup.json`
   and offer to upload it to Drive (shared with advayaicopilot@gmail.com).

## Never

Send email or messages, publish posts, comment publicly, change the website,
or spend money. Gmail drafts are allowed (the founder sends them).
