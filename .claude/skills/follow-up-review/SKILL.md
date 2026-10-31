---
name: follow-up-review
description: >-
  Reviews TenderTez prospects who are due a follow-up, reads their real
  interaction history (CRM and Gmail thread), and prepares one personalised
  follow-up each as a Gmail draft and a CRM draft. Respects opt-outs and the
  one-follow-up limit. Never sends. Use when the user says "follow-ups",
  "who should I follow up with", or runs /follow-up-review.
---

# /follow-up-review

Work from `marketing/automation`. Limits from `marketing-config.json`:
`follow_up_after_days` (5) and `max_follow_ups` (1).

## Steps

1. `python3 -m ttm follow-ups` lists who is due. Also check warm prospects
   (`--stage replied`, `demo`, `activated`) whose `next_action_date` has passed.
2. For each, read `python3 -m ttm prospect <id>` and the Gmail thread with
   that address (search `to:<contact> OR from:<contact>`). If they replied in
   the meantime, record the reply instead (`ttm stage <id> reply …`) and don't
   follow up. If they said no or asked not to be contacted: `ttm stage <id> opt_out`.
3. Draft one short follow-up based on what actually happened (their business,
   the first message, any reply). Use template 6 in
   `marketing/leads/outreach-templates.md` as a base. No pressure, no new
   claims, the opt-out line stays.
4. Create a Gmail **draft** as a reply in the same thread
   (`replyToMessageId`). After the founder sends it, record it with
   `python3 -m ttm stage <id> followed_up --channel email` (this also stops
   further follow-ups).
5. Report the drafts and anything that needs the founder's judgement.

Never send, never follow up twice, never contact an opted-out business or a
personal number that wasn't given to us.
