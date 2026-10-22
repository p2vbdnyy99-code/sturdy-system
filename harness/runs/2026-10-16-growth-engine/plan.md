# Plan: growth engine, phases 1–2 (16 Oct 2026)

Request: "Deploy, start and do this: TenderTez autonomous marketing and
customer acquisition engine" (founder, 16 Oct). ₹0 spend; nothing sent or
published without approval; no fabricated data; prospect data never in Git.

| # | Step | Files | Output | Check (written first) |
|---|---|---|---|---|
| 1 | Website quick wins (done and deployed earlier today) | `backend/src/landingPages.js`, `seo.js`, `server.js`, frontend landing route | landing pages, JSON-LD, `/llms.txt` | `landing-pages.test.js`; browser `landing-verify.mjs` |
| 2 | Marketing library and CLI | `marketing/automation/ttm/*` | CRM (funnel, duplicates, opt-outs, contacted-before, imports), content queue (claim lint, UTMs), report, dashboard, SEO audit, kill switch, dry run | `python3 -m unittest discover -s tests`: save, duplicate refused, draft, queue, approve, outreach outcome, weekly report, kill switch, MCP protocol, CLI |
| 3 | Tendertez Marketing MCP | `marketing/automation/mcp_server.py`, `/.mcp.json` | 9 tools, no publish/send | protocol tests + live calls in a Claude Code session (search, draft, refused claim) |
| 4 | Live SEO audit + fix | `ttm seo-audit`; `landingPages.js` description length | `marketing/seo/technical-audit.md`; descriptions ≤ ~160 | audit run on tendertez.in; new assertion in `landing-pages.test.js` |
| 5 | Real data (git-ignored) | `marketing/data/` | earlier Gmail contacts recorded; verified prospects with sources; 2 Gmail drafts; real site metrics | `ttm status`; report shows only recorded numbers |
| 6 | Docs and research | `marketing/*.md`, `research/`, `leads/`, `seo/`, `analytics/` | connector matrix with tested status, templates, KPI/UTM, calendar | no prospect or user names in committed files (`grep`) |
| 7 | Content calendar | `marketing/content/content-calendar.csv` | 30 days, sourced, linted, LinkedIn/X queued | every draft passes `content.lint`; no duplicates |
| 8 | Skills | `.claude/skills/{marketing-daily,find-prospects,content-batch,seo-review,follow-up-review,weekly-growth-report}` | 6 skills | listed by Claude Code; each says what it never does |
| 9 | Verify, document, commit, deploy | `BIDPILOT_ARCHITECTURE.md`, `CLAUDE.md`, this run | | `verify.sh --checks`; live check of a landing page description after deploy |
