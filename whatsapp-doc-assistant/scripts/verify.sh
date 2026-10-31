#!/usr/bin/env bash
# The standard checks for a TenderTez change, in one command:
#   backend tests in three setups (database + CSRF secret, database only,
#   neither), frontend build, lint and unit tests, and the secret scan.
#
#   scripts/verify.sh                   print the results table
#   scripts/verify.sh --checks FILE     also append the rows to FILE
#                                       (a run's checks.md)
#
# Each row is: step | requirement | verdict | evidence. Verdict is pass or
# fail; a step that couldn't run is unresolved. Exit 0 only if every row
# passed. Needs the local Postgres (started here if it isn't running) with the
# dev database at postgres://postgres:devlocal@localhost:5432/bidpilot_dev.
set -u
checks_file=""
[[ "${1:-}" == "--checks" ]] && checks_file="${2:-}"

app="$(cd "$(dirname "$0")/.." && pwd)"
db_url="${VERIFY_DATABASE_URL:-postgres://postgres:devlocal@localhost:5432/bidpilot_dev}"
rows=()
failed=0

row() { # step, requirement, verdict, evidence
  rows+=("| $1 | $2 | $3 | $4 |")
  [[ "$3" == "pass" ]] || failed=1
}

summary() { # node --test output -> "pass N, fail N, skipped N"
  local p f s
  p=$(grep -E '^# pass' <<<"$1" | awk '{print $3}')
  f=$(grep -E '^# fail' <<<"$1" | awk '{print $3}')
  s=$(grep -E '^# skipped' <<<"$1" | awk '{print $3}')
  echo "pass ${p:-?}, fail ${f:-?}, skipped ${s:-?}"
}

if ! pg_isready -q 2>/dev/null; then
  sudo service postgresql start >/dev/null 2>&1
  sleep 2
fi
if pg_isready -q 2>/dev/null; then db_ok=1; else db_ok=0; fi

run_backend() { # label, env...
  local label="$1"; shift
  local out
  out="$(cd "$app/backend" && env -u DATABASE_URL -u TEST_DATABASE_URL -u BIDPILOT_CSRF_SECRET "$@" npm test 2>&1)"
  local verdict=pass
  grep -qE '^# fail 0$' <<<"$out" || verdict=fail
  row "backend tests: $label" "all backend tests pass" "$verdict" "$(summary "$out")"
}

if (( db_ok )); then
  run_backend "database + CSRF secret" DATABASE_URL="$db_url" BIDPILOT_CSRF_SECRET=verify-local-secret
  run_backend "database only" DATABASE_URL="$db_url"
else
  row "backend tests: database setups" "all backend tests pass" "unresolved" "local Postgres could not be started"
fi
run_backend "no database"

if out="$(cd "$app/frontend" && npm run build 2>&1)"; then
  row "frontend build" "type check and build succeed" pass "$(grep -oE 'built in [0-9.]+m?s' <<<"$out" | tail -1)"
else
  row "frontend build" "type check and build succeed" fail "$(grep -iE 'error' <<<"$out" | head -1 | cut -c1-120)"
fi
lint_counts() { echo "$(grep -cE ':[0-9]+:[0-9]+: warning' <<<"$1") warnings, $(grep -cE ':[0-9]+:[0-9]+: error' <<<"$1") errors"; }
if out="$(cd "$app/frontend" && npm run lint 2>&1)"; then
  row "frontend lint" "lint exits 0" pass "$(lint_counts "$out")"
else
  row "frontend lint" "lint exits 0" fail "$(lint_counts "$out")"
fi
tests=$(cd "$app/frontend" && find src -name '*.test.ts' | sort | tr '\n' ' ')
out="$(cd "$app/frontend" && node --test $tests 2>&1)"
if grep -qE '^# fail 0$' <<<"$out"; then
  row "frontend unit tests" "all pass" pass "$(summary "$out")"
else
  row "frontend unit tests" "all pass" fail "$(summary "$out")"
fi

if out="$("$app/scripts/secret-scan.sh" 2>&1)"; then
  row "secret scan" "no secrets in the change" pass "$(tail -1 <<<"$out")"
else
  row "secret scan" "no secrets in the change" fail "$(grep -c ':' <<<"$out") hit(s)"
fi

header="| step | requirement | verdict | evidence |"
divider="|---|---|---|---|"
printf '%s\n%s\n' "$header" "$divider"
printf '%s\n' "${rows[@]}"
if [[ -n "$checks_file" ]]; then
  { [[ -s "$checks_file" ]] || printf '%s\n%s\n' "$header" "$divider"; printf '%s\n' "${rows[@]}"; } >> "$checks_file"
fi
exit $failed
