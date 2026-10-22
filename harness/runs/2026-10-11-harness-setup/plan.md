# Plan: set up the harness for this repository

Task: implement the agent harness from the user's "Creator of Claude Code"
image for TenderTez. Allowed changes: `CLAUDE.md`, `harness/`, `.claude/`, and
`whatsapp-doc-assistant/scripts/`. No application code. Run limit: this
session.

| # | Step | Reads / writes | Output | Check | Parallel? |
|---|---|---|---|---|---|
| 1 | Secret scan script | writes `whatsapp-doc-assistant/scripts/secret-scan.sh` | script | clean on the current tree; finds a planted key and a planted remote DB password; `--all` clean | yes |
| 2 | Bash guard hook | writes `.claude/hooks/guard-bash.sh` | script | pipe test: allowed commands exit 0, token printing, `pkill -f`, `killall` and force-push exit 2; a planted secret blocks `git commit` | after 1 |
| 3 | Turn the hook on | writes `.claude/settings.json` | settings | `jq -e` finds the command; a live harmless `killall --version` is blocked in this session | after 2 |
| 4 | Verification script | writes `whatsapp-doc-assistant/scripts/verify.sh` | script | all rows pass and match the manual 3x numbers | yes |
| 5 | Project rules and lessons | writes `CLAUDE.md` | file | lists every hook and script; holds the lessons from this project so far | after 1-4 |
| 6 | Harness guide | writes `harness/README.md` | file | covers inputs, the run folder, the 7 layers, the loop, delivery and resuming | yes |
| 7 | This run's record | writes `harness/runs/2026-10-11-harness-setup/*` | plan, checks, progress | checks.md produced by `verify.sh --checks` plus the hook evidence | last |
