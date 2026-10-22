#!/usr/bin/env bash
# Scan for secrets that must never be committed: Fly tokens, OpenAI/GitHub/
# AWS/Google/Slack keys, private keys, and database URLs with a password for a
# non-local host.
#
#   scripts/secret-scan.sh            what a commit could include: added lines
#                                     in `git diff HEAD` plus untracked files
#   scripts/secret-scan.sh --all      every tracked file
#
# Exit 0 = clean, 1 = something found (each hit is printed as file:line with
# the value masked), 2 = could not run. Run from anywhere inside the repo.
set -u
mode="${1:---changes}"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "secret-scan: not in a git repository" >&2; exit 2; }
cd "$root" || exit 2

PATTERN='FlyV1 fm[0-9]_|fm[0-9]_[A-Za-z0-9+/=]{40,}|sk-(proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^:@/ ]+:[^@/ ]{6,}@'
# Local development databases and placeholders like sk-xxxxxxxx are not secrets.
ALLOW='@(localhost|127\.0\.0\.1)[:/]|x{12,}'
SKIP='(^|/)(node_modules|dist|\.git)/|package-lock\.json$|\.(png|jpe?g|gif|pdf|ico|woff2?)$'

mask() { sed -E 's/([A-Za-z0-9_+\/=-]{6})[A-Za-z0-9_+\/=-]{10,}/\1…[masked]/g'; }

hits=0
report() { # file, line-number, text
  printf '%s:%s: %s\n' "$1" "$2" "$(printf '%s' "$3" | cut -c1-160 | mask)"
  hits=$((hits + 1))
}

scan_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  [[ "$f" =~ $SKIP ]] && return 0
  while IFS=: read -r n text; do
    [[ "$text" =~ $ALLOW ]] && continue
    report "$f" "$n" "$text"
  done < <(grep -nIE "$PATTERN" "$f" 2>/dev/null)
}

if [[ "$mode" == "--all" ]]; then
  while IFS= read -r f; do scan_file "$f"; done < <(git ls-files)
else
  # Added lines in tracked files, staged or not.
  current=""
  lineno=0
  while IFS= read -r line; do
    case "$line" in
      '+++ b/'*) current="${line#+++ b/}" ;;
      '@@ '*) lineno=$(sed -E 's/^@@ -[0-9,]+ \+([0-9]+).*/\1/' <<<"$line"); lineno=$((lineno - 1)) ;;
      '+'*)
        lineno=$((lineno + 1))
        [[ "$current" =~ $SKIP ]] && continue
        text="${line#+}"
        if grep -qE "$PATTERN" <<<"$text" && ! grep -qE "$ALLOW" <<<"$text"; then report "$current" "$lineno" "$text"; fi ;;
      ' '*) lineno=$((lineno + 1)) ;;
    esac
  done < <(git diff HEAD --unified=0 --no-color 2>/dev/null)
  # New files git doesn't track yet.
  while IFS= read -r f; do scan_file "$f"; done < <(git ls-files --others --exclude-standard)
fi

if (( hits > 0 )); then
  echo "secret-scan: $hits possible secret(s) found. Remove them before committing." >&2
  exit 1
fi
echo "secret-scan: clean ($mode)"
