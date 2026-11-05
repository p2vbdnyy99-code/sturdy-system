#!/bin/bash
# Runs every freshness browser check in every state, on the LOCAL harness only.
#   RESTART=<command that restarts the local harness server on 8790> ./state-checks.sh
# Before: the local test database is migrated and seeded with the harness
# tenders (40 central, 60 Maharashtra, 30 GeM). Each state is written straight
# into discovery_state, then the server is restarted (the facet counts are
# cached for 5 minutes), then that state's checks run at 390 and 1366 px.
# Screenshots go to SHOTS (default: ./state-checks next to this file).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
runs="$(dirname "$here")"
origin="${ORIGIN:-http://localhost:8790}"
db="${DB:-postgres://postgres:devlocal@localhost:5432/bidpilot_dev}"
case "$db" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "refusing a non-local database" >&2; exit 2 ;; esac
case "$origin" in http://localhost:*|http://127.0.0.1:*) ;; *) echo "refusing a non-local server" >&2; exit 2 ;; esac
: "${RESTART:?set RESTART to the command that restarts the local harness server}"
export SHOTS="${SHOTS:-$here/state-checks}"
mkdir -p "$SHOTS"

# set_state <central> <state> <gem> <error or empty>; each time is an ISO timestamp or null.
set_state() {
  q() { [ "$1" = null ] && echo null || echo "'$1'"; }
  local err=null; [ -n "$4" ] && err="'$4'"
  psql "$db" -q -c "delete from discovery_state;
    insert into discovery_state (list, next_page, last_success_at, last_error, updated_at) values
      ('central', 1, $(q "$1"), $err, now()), ('state', 1, $(q "$2"), $err, now()), ('gem', 1, $(q "$3"), $err, now());" || exit 1
  sh -c "$RESTART" > /dev/null || exit 1
}
results=()
run() { # run <state label> <script> <args...>
  local label="$1"; shift
  local out; out="$(node "$@" 2>&1)"; local code=$?
  echo "$out" | grep -E '^(PASS|FAIL)' | grep -v '^PASS' ; echo "$out" | tail -1
  results+=("$label | $(basename "$1") ${*:2} | $(echo "$out" | tail -1) | exit $code")
}
iso() { date -u -d "$1" +%Y-%m-%dT%H:%M:%SZ; }
ist_long() { TZ=Asia/Kolkata date -d "$1" '+%-d %B %Y'; }

echo "== fresh"; h1="$(iso '1 hour ago')"
set_state "$h1" "$h1" "$h1" ""
run fresh "$runs/2026-11-04-phase1-measurement/list-browser-check.cjs" "$origin" fresh
run fresh "$runs/2026-11-05-feed-freshness/freshness-browser-check.cjs" "$origin" fresh
run fresh "$here/home-browser-check.cjs" "$origin" fresh

echo "== delayed (central and state 5 h old, GeM 1 h)"; h5="$(iso '5 hours ago')"
set_state "$h5" "$h5" "$h1" ""
run delayed "$runs/2026-11-05-feed-freshness/delayed-check.cjs" "$origin"
run delayed "$here/home-browser-check.cjs" "$origin" delayed

echo "== stale (3 days old, failing)"; d3="$(iso '3 days ago')"; d3t="$(ist_long "$d3")"
set_state "$d3" "$d3" "$d3" "CPPP answered 404"
run stale "$runs/2026-11-04-phase1-measurement/list-browser-check.cjs" "$origin" stale "$d3t"
run stale "$runs/2026-11-05-feed-freshness/freshness-browser-check.cjs" "$origin" stale "$d3t"

echo "== unavailable (last success 23 October 2026, failing)"
set_state 2026-10-23T15:29:45Z 2026-10-23T15:29:50Z 2026-10-23T15:29:38Z "CPPP answered 404"
run unavailable "$runs/2026-11-04-phase1-measurement/list-browser-check.cjs" "$origin" stale "23 October 2026"
run unavailable "$runs/2026-11-05-feed-freshness/freshness-browser-check.cjs" "$origin" stale "23 October 2026"
run unavailable "$here/home-browser-check.cjs" "$origin" stale-same
run "unavailable (browser given no freshness)" "$here/home-browser-check.cjs" "$origin" unknown

echo "== stale on different days"
set_state 2026-10-23T15:29:45Z 2026-10-20T10:00:00Z 2026-10-24T08:00:00Z "CPPP answered 404"
run "stale, different days" "$here/home-browser-check.cjs" "$origin" stale-different

echo "== never read"
set_state null null null ""
run "never read" "$here/home-browser-check.cjs" "$origin" never

echo; echo "state | check | result | exit"
printf '%s\n' "${results[@]}"
! printf '%s\n' "${results[@]}" | grep -q 'exit [^0]'
