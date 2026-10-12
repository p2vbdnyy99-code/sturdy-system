#!/usr/bin/env bash
# PreToolUse guard for Bash commands (see CLAUDE.md, "Hooks and scripts").
# Reads the hook JSON on stdin. Exit 2 blocks the command and tells Claude why;
# exit 0 lets it run. Each rule exists because the mistake really happened or
# would be costly; prose instructions alone did not make it impossible.
set -u
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }

# 1. Never print the Fly token. The only allowed use is reading it straight into
#    the variable: FLY_API_TOKEN="$(tr -d '\n' < .../.fly-token)"
if grep -qE '(^|[;&|[:space:](])(cat|head|tail|less|more|xxd|od|base64|strings|grep|sed|awk|nl|tee|cp|scp|curl)[[:space:]][^;&|]*\.fly-token' <<<"$cmd"; then
  block "this command would print or copy the Fly token. Read it only as FLY_API_TOKEN=\"\$(tr -d '\\n' < \$S/.fly-token)\"."
fi
if grep -q 'FLY_API_TOKEN' <<<"$cmd"; then
  if grep -qE '(echo|printf|printenv|declare -p|export -p)[^;&|]*FLY_API_TOKEN' <<<"$cmd" \
    || grep -qE '(^|[;&|[:space:]])(env|printenv|set)[[:space:]]*($|[;&|])' <<<"$cmd"; then
    block "this command would print FLY_API_TOKEN."
  fi
fi

# 2. pkill -f / killall match their own shell's command line and have killed
#    the session's shell before. Kill by PID after checking /proc/<pid>/cmdline.
if grep -qE '(^|[;&|[:space:]])(pkill[[:space:]]+(-[a-zA-Z]*f|--full)|killall)([[:space:]]|$)' <<<"$cmd"; then
  block "pkill -f and killall can kill this session's own shell. Find the PID with pgrep -x, check /proc/<pid>/cmdline, then kill <pid>."
fi

# 3. No plain force-push. --force-with-lease is allowed (needed only when the
#    branch holds already-merged history).
if grep -oE 'git[[:space:]]+push[^;&|]*' <<<"$cmd" | grep -qE '(^|[[:space:]])(--force|-f|-[a-zA-Z]*f[a-zA-Z]*)([[:space:]]|$)'; then
  block "plain force-push is not allowed. Use --force-with-lease, and only when the branch contains only already-merged history."
fi

# 4. Secret scan before any commit.
if grep -qE 'git[[:space:]]+([^;&|]*[[:space:]])?commit([[:space:]]|$)' <<<"$cmd"; then
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  scan="$root/whatsapp-doc-assistant/scripts/secret-scan.sh"
  if [[ -x "$scan" ]]; then
    if ! out="$("$scan" 2>&1)"; then
      block "secret scan failed before commit:
$out"
    fi
  fi
fi

exit 0
