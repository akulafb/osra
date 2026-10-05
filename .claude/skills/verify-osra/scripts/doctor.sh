#!/usr/bin/env bash
# Read-only: is this run's instance worth driving? Exits non-zero on the first failed check.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
osra_require_run_dir "${1:-}"
run_dir="$1"
fail() { echo "FAIL  $*"; exit 1; }
ok() { echo "ok    $*"; }

pid="$(cat "$run_dir/state/vite.pid")"
kill -0 "$pid" 2>/dev/null || fail "vite pid $pid is not running (see $run_dir/evidence/vite.log)"
ok "vite pid $pid running"

[[ "$(osra_port_pid)" == "$pid" ]] || fail "port $OSRA_PORT is held by '$(osra_port_pid)', not our pid $pid"
ok "port $OSRA_PORT owned by our pid"

grep -q "Supabase:  $OSRA_DEV_REF" "$run_dir/evidence/vite.log" || fail "vite did not announce the dev Supabase ref"
ok "Supabase project is dev ($OSRA_DEV_REF)"

curl -fsS "http://localhost:$OSRA_PORT/" | grep -q '<title>Osra' || fail "http://localhost:$OSRA_PORT/ did not serve the Osra page"
ok "http://localhost:$OSRA_PORT serves Osra"

repo="$(cat "$run_dir/state/repo")"
now="$(git -C "$repo" rev-parse HEAD)"
[[ "$now" == "$(cat "$run_dir/state/head")" ]] && ok "HEAD $(git -C "$repo" rev-parse --short HEAD) on $(cat "$run_dir/state/branch") (unchanged since launch)" \
  || echo "WARN  HEAD moved since launch ($(cut -c1-7 "$run_dir/state/head") -> ${now:0:7}); Vite hot-reloads, but say which commit you proved"

orca tab list --json >/dev/null 2>&1 || fail "orca CLI cannot reach Orca (run: orca open --json)"
ok "Orca reachable"

page="$(cat "$run_dir/state/page" 2>/dev/null || true)"
if [[ -n "$page" ]]; then
  signed_in="$(orca eval --page "$page" --expression "String(!!localStorage.getItem('sb-$OSRA_DEV_REF-auth-token'))" --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['result'])")"
  [[ "$signed_in" == "true" ]] && ok "tab $page has a dev Supabase session" \
    || echo "WARN  tab $page has no dev Supabase session: signed-in features show the landing page. The owner must sign in with Google in this Orca tab."
else
  echo "info  no browser tab recorded yet (open one with: open-tab.sh $run_dir)"
fi
