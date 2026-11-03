# Project status: specialist file-processing product

Last updated: 2026-11-03 · Phase: **0 (workspace setup)** · Build status: **not started**

This file holds only facts that were checked in the session that wrote it, plus open blockers and the next proposed
action. The governing charter is the founder's `CLAUDE.md` ("Project Operating Charter"). It was uploaded in that
session but is **not yet in this repository** (see blocker 1).

## Verified facts (checked 2026-11-03)

**Environment**
- Claude Code is running in a **cloud** container (Anthropic-managed remote session), not on the founder's laptop.
  The container is temporary: anything that is not committed and pushed is lost when it is reclaimed.
- Runtimes available: Node 22.23.4, npm 10.9.9, Python 3.13.18, git 2.43.0, Linux 6.18, 4 vCPU, 15 GiB RAM.
- No application code, hosting, domain, payment provider or paid service has been set up for this product.

**Repository**
- Repo: `p2vbdnyy99-code/sturdy-system` (GitHub), branch `claude/ai-copilot-prototype-setup-pfgau3`, which tracks
  `origin` and was clean before this file was added. 29 commits; latest 2026-11-02.
- The repo is **not empty and not dedicated to this product.** It holds four unrelated projects:
  - `ai-copilot-prototype/`: a browser-extension AI copilot
  - `neetpg-qbank/`: a question bank
  - `self-learning-agent/`: a paper-trading launch classifier
  - `venturescout/`: an opportunity-research workflow with its own reports and decisions
- No existing code or research covers image conversion or optimisation. A search for HEIC/WebP/AVIF/image-compression
  terms found only incidental matches in `neetpg-qbank`.
- `venturescout/reports/venture-decision.md` (2026-10-22) records the decision "RESEARCH FURTHER". The leading
  candidate there is a Jira Cloud reporting app, and the generic document-to-spreadsheet SaaS was rejected. The image
  product in the charter does not appear in that pipeline.

## Blockers and open decisions (founder)

1. **Where this project lives.** Options: (a) a new dedicated GitHub repo (recommended, because the charter's Phase 0
   expects a clean baseline and a root `CLAUDE.md`, and a root `CLAUDE.md` here would also govern four unrelated
   projects); (b) keep it in this `file-processing/` folder with its own `CLAUDE.md`.
2. **Relationship to VentureScout.** Is the image product replacing the Jira candidate, running alongside it, or meant
   to be scored through the same VentureScout gates? The charter says not to run several major workstreams at once.
3. ~~Income target mismatch~~ **Resolved 2026-11-03:** the founder set US$100–200/day (about US$3,000–6,000/month)
   as the minimum target. Phase 1 must test whether that is realistic.
3a. **Timeline (founder, 2026-11-03):** compress Phases 1–3 into days, not weeks. Research takes about 1–2 days and a
   narrow MVP about 1–2 days. Revenue itself cannot be validated in days (see the Phase 1 plan).
4. **Mobile review workflow.** Not yet confirmed how the founder will review diffs and approve work from iPhone/iPad
   (for example: the Claude app session view, GitHub mobile PR review).
5. **Persistence.** This file is uncommitted. It needs approval to commit and push, or it will be lost with the container.

## Next proposed action

After the founder resolves blockers 1–3: write the Phase 1 research plan (sources, checked dates, which metrics can
be measured for free and which cannot), then wait for approval to start Phase 1. No application code until a GO decision.
