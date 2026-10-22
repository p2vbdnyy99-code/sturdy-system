# Plan: growth sprint, paying customers (16 Oct 2026)

Request: the founder's "autonomous growth engineer" brief (16 Oct). Audit,
then fix the Google-redirect links, rework outreach, find prospects, plan
social content, and audit pricing, conversion and tracking. Nothing is sent,
posted, pushed or deployed without approval. Nothing is fabricated.
Prospect data never goes in Git.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Find the redirect cause | Gmail drafts (raw MIME), live site | root cause | 3 test drafts read back raw, then deleted; site URLs answer 200 with no redirect |
| 2 | Link validator and policy | `marketing/automation/ttm/links.py`, `content.py`, `marketing/link-policy.md` | `build_url`, `check_url`, `check_text`; lint rejects wrapped, shortened, non-canonical and non-standard links | `tests/test_links.py` |
| 3 | Daily post in the repo | `ttm/daily_post.py`, `cli.py` | `ttm daily-post` | `DailyPostTests`; live run returns a post whose links pass the policy |
| 4 | Outreach pack | Google Doc (Drive) | 3 reworked messages, 5 templates | every link opened (HTTP 200, no redirect); the Doc keeps links unwrapped |
| 5 | Prospects | `marketing/data/` (git-ignored), Drive sheet | verified prospects with evidence and published contacts | `prospect-add` duplicate and contacted-before checks; each contact read from the firm's own page |
| 6 | Social plan | `marketing/content/content-calendar-2026-10-19.csv`, `social-audit-2026-10-16.md`, queue, Google Doc | 12 LinkedIn + 16 X posts | every post passes `content.lint`; links answer 200; rules read in the cited primary documents; product claims matched to code |
| 7 | Conversion fixes | `frontend/src/pages/GovernmentTenders.tsx`, `Home.tsx` | state page counts its own list; example deadline never in the past | browser check against a local build |
| 8 | Campaign tracking | `frontend/src/api/visits.ts` (+ test) | standard links counted as `source.campaign` in the existing column | `src/api/visits.test.ts` |
| 9 | Verify and document | `BIDPILOT_ARCHITECTURE.md`, `marketing/README.md`, this run | | `verify.sh --checks`; `python3 -m unittest` in marketing/automation |
