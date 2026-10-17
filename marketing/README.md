# TenderTez marketing workspace

The marketing operations system for TenderTez (https://tendertez.in). It finds
real Indian tender bidders, keeps them in a small CRM, queues content for
approval and reports what actually happened. It never sends, posts or spends
anything by itself: the founder approves and publishes by hand, and the system
records the result.

Python 3.11+ standard library only. No accounts, no paid services, no network
access except the SEO audit (which reads the public website).

## What is where

| Path | What it is | In Git? |
|---|---|---|
| `strategy.md` | Product audit, top 10 opportunities, plan for the first five paying customers | yes |
| `brand-guide.md` | Voice, claims we may and may not make, link tracking | yes |
| `research/` | Connector matrix (X, LinkedIn, Google, email, others), channels, competitors, personas, objections, keywords | yes |
| `leads/` | Lead CSV template, scoring rules, outreach templates | yes (no contact data) |
| `content/content-calendar.csv` | 30-day calendar of draft posts with sources | yes |
| `seo/` | Live technical audit, keyword map, internal links, structured data plan | yes |
| `analytics/` | KPI definitions, weekly report template, UTM convention | yes |
| `automation/ttm/` | The CLI and library (CRM, content queue, report, SEO audit, dashboard) | yes |
| `automation/mcp_server.py` | The Tendertez Marketing MCP server (registered in `/.mcp.json`) | yes |
| `automation/tests/` | Tests, mock data only | yes |
| `data/` | The real CRM, content queue, event log, dashboard | **no** (git-ignored; the repo is public) |
| `marketing-config.json` | Your settings (copy of the example) | **no** |

Prospect, contact and CRM data never go into a commit (the repository is public).

## Setup (once)

```sh
cd marketing
cp marketing-config.example.json marketing-config.json   # optional: defaults are safe
cd automation
python3 -m unittest discover -s tests                     # 22 tests, mock data, no network
python3 -m ttm status
```

The MCP server starts by itself in Claude Code sessions opened in this
repository (it is listed in `/.mcp.json`; approve it when Claude Code asks).

## Safety settings (`marketing-config.json`)

- `kill_switch: true` stops every command that changes data, in the CLI and the
  MCP server. Use it if anything looks wrong.
- `dry_run: true` (default): nothing reaches the outside world. There is no code
  that sends or publishes today, so this stays true until a publishing
  integration is authorised and tested.
- `require_approval`: publishing, messages, emails, public comments, website
  changes and spending all need the founder. Only the founder may relax these,
  after the workflow is tested.
- `limits`: at most 10 new outreach messages a day, one follow-up after 5 days.

## Daily use (CLI, from `marketing/automation`)

```sh
python3 -m ttm status                          # settings and counts
python3 -m ttm dashboard                       # writes data/dashboard.html; open it in a browser
python3 -m ttm prospects --tier A              # the CRM
python3 -m ttm prospect pr_xxxx                # one prospect with evidence and history
python3 -m ttm prospect-add @new.json          # save verified prospects (refuses duplicates,
                                               #  opted-out and already-contacted businesses)
python3 -m ttm contacted-before info@firm.in --date 2026-10-06 --source "Gmail sent"
python3 -m ttm stage pr_xxxx verify|draft|approve|contacted|followed_up|reply|demo|activated|paid|lost|opt_out
python3 -m ttm follow-ups                      # who is due a follow-up today
python3 -m ttm leads-csv ../data/leads.csv    # the CRM as a leads CSV (stays out of Git)
python3 -m ttm draft --platform linkedin --text "…" --topic "…" --audience "…" --purpose "…" --source URL
python3 -m ttm queue --status draft            # posts waiting for approval
python3 -m ttm approve ct_xxxx                 # then publish by hand, then:
python3 -m ttm published ct_xxxx https://www.linkedin.com/posts/…
python3 -m ttm metrics ct_xxxx --impressions 300 --clicks 4 --enquiries 1
python3 -m ttm site-metrics --week-ending 2026-10-18 --source visits-report.mjs --visits 120 --signups 3
python3 -m ttm report                          # weekly report (markdown); --json for data
python3 -m ttm seo-audit > ../seo/technical-audit-live.md
python3 -m ttm daily-post                      # today's tender post (JSON); posts nothing
python3 -m ttm export ~/tendertez-marketing-backup.json   # back up data/
python3 -m ttm import backup.json              # restore (refuses to overwrite without --force)
```

### The outreach funnel

`identified → verified → drafted → approved → contacted → replied → demo →
activated (first successful analysis) → paid`, plus `lost` and `opted_out`.

- `contacted` is refused unless the draft was approved.
- One follow-up at most; `follow-ups` lists who is due.
- `opt_out` puts the business on a suppression list; it can never be added again.
- `contacted-before` lists businesses emailed outside the CRM (the founder's
  Gmail outreach of 6–15 Oct 2026 is recorded), so nobody gets a second first
  message.

### Content rules the queue enforces

Every draft needs a topic, a named audience and a purpose. The queue refuses:
accuracy promises ("100% accurate", "never miss"), "win bids", bid/no-bid
verdicts, superlatives ("best", "#1"), testimonials, "saves N hours", and any
number without a source URL. X posts are checked at 280 characters (links count
as 23). Links to tendertez.in get standard UTMs, and wrapped
(`google.com/url?q=`), shortened, non-canonical and non-standard links are
refused (`link-policy.md`, `ttm/links.py`).

## Claude Code skills

Run these in a Claude Code session in this repository:

| Skill | What it does | Never does |
|---|---|---|
| `/marketing-daily` | Reviews the workspace, approvals, follow-ups and news; writes today's actions | send or publish |
| `/find-prospects` | Finds and verifies new businesses with public evidence of tender activity; saves them with sources | guess contacts, re-add contacted businesses |
| `/content-batch` | Drafts a batch of sourced, platform-specific posts into the queue | publish |
| `/seo-review` | Runs the live audit, ranks issues, proposes or makes approved fixes with tests | deploy without approval |
| `/follow-up-review` | Prepares follow-ups from real history for prospects who are due | send, or contact opted-out businesses |
| `/weekly-growth-report` | The weekly report with stop / continue / improve | invent metrics |

The skills live in `/.claude/skills/<name>/SKILL.md`.

## MCP tools (Tendertez Marketing MCP)

`get_content_queue`, `draft_linkedin_post`, `draft_x_post`,
`search_saved_prospects`, `get_prospect_details`, `save_prospect`,
`mark_outreach_approved`, `record_campaign_result`,
`get_weekly_marketing_report`. They call the same library as the CLI, so the
same checks apply. There is no publish or send tool: see
`research/connector-matrix.md` for why and what would be needed.

## Data lives only on this machine

`data/` is git-ignored and the cloud session's container is temporary. Back up
after each session with `python3 -m ttm export <file>` and keep the file in
your Google Drive (not in the repository).
