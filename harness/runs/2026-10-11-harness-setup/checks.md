| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 503, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 340, fail 0, skipped 16 |
| backend tests: no database | all backend tests pass | pass | pass 280, fail 0, skipped 26 |
| frontend build | type check and build succeed | pass | built in 636ms |
| frontend lint | lint exits 0 | pass | 10 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 22, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 secret scan | clean on the current change | pass | `secret-scan.sh` → "clean (--changes)" |
| 1 secret scan | finds planted secrets, masks them | pass | planted `sk-proj-…` key and `postgres://admin:…@db.example.com` both reported, values masked, exit 1; localhost URL ignored |
| 1 secret scan | whole repo clean | pass | `--all` first flagged 3 `.env.example` placeholders (`sk-xxxx…`, checked: not real keys); placeholders allowed; then "clean (--all)" |
| 2 guard hook | allowed commands still run | pass | pipe test, exit 0: `ls`, the approved token read + deploy, the multi-line ssh pattern, `ls .fly-token`, `pgrep -x`, `kill <pid>`, `--force-with-lease`, `git push -u … && rm -f`, `git status`, commit with no secrets |
| 2 guard hook | blocks token printing, pkill -f, killall, force-push | pass | pipe test, exit 2: `cat`/`head` of `.fly-token`, `echo`/`printenv` of the token, `env` with the token set, `pkill -f`, `killall`, `git push --force`, `git push -f` |
| 2 guard hook | blocks a commit containing a secret | pass | planted `ghp_…` file → `git add -A && git commit` blocked with the masked hit; file removed afterwards |
| 3 settings | hook is wired and live | pass | `jq -e` returns the command; live `killall --version` in this session was blocked by the hook |
