# Progress: harness setup (2026-10-11)

## Plan
All 7 steps done. Nothing running or blocked.

## Outputs
- `CLAUDE.md`
- `harness/README.md`
- `harness/runs/2026-10-11-harness-setup/plan.md`, `checks.md`, `progress.md`
- `.claude/settings.json`, `.claude/hooks/guard-bash.sh`
- `whatsapp-doc-assistant/scripts/secret-scan.sh`, `whatsapp-doc-assistant/scripts/verify.sh`

## Decisions
- These rules became hooks or scripts because prose alone didn't make them
  hold: never print the Fly token; no `pkill -f` or `killall` (one killed this
  session's shell); no plain force-push; a secret scan before every commit;
  one command for the standard verification.
- The approval gate for commit and deploy stays a written rule. A hook can't
  tell whether the user said "commit", so a hook check would be theatre.
- The secret scan allows localhost database URLs and `xxxx` placeholders. The
  repo's `.env.example` files hold placeholders, which I checked are not real
  keys.
- Run folders are committed, so the plan, checks and decisions stay with the
  code.

## Open issues
- None found in the checks.
- The guard matches command text, so a determined workaround (for example a
  script file that prints the token) is not caught. It prevents accidents,
  not abuse.

## Next action
None. The user approved the commit on 2026-10-12. There is nothing to deploy:
no application code changed.
