# Shared settings for the verify-osra helpers. Sourced, not run.
OSRA_PORT=5173
OSRA_WAIT_SECS="${OSRA_WAIT_SECS:-1200}"   # how long launch.sh waits for another run to free the port
OSRA_DEV_REF=djwqamcfllqziqiyvyjj
OSRA_VERIFY_ROOT=/tmp/osra-verify

osra_repo_root() {
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel
}

osra_port_pid() {
  lsof -nP -t -iTCP:"$OSRA_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

osra_require_run_dir() {
  if [[ -z "${1:-}" || ! -d "$1/state" ]]; then
    echo "usage: $(basename "$0") <run-dir>  (the RUN_DIR printed by launch.sh; state/ missing)" >&2
    exit 2
  fi
}

# Prints why the server on the port is not this run's (vite gone, port taken by another
# process, another checkout, or another commit). Prints nothing when it is this run's.
osra_server_problem() {
  local run_dir="$1" pid holder cwd top want head want_head
  pid="$(cat "$run_dir/state/vite.pid" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then echo "this run recorded no vite pid in $run_dir/state/vite.pid"; return; fi
  holder="$(osra_port_pid)"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "this run's vite (pid $pid) is gone (see $run_dir/evidence/vite.log)${holder:+, and port $OSRA_PORT is now held by pid $holder in $(lsof -a -p "$holder" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)}"
    return
  fi
  if [[ "$holder" != "$pid" ]]; then echo "port $OSRA_PORT is held by pid ${holder:-none}, not this run's vite (pid $pid)"; return; fi
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
  top="$(git -C "${cwd:-/nonexistent}" rev-parse --show-toplevel 2>/dev/null || true)"
  want="$(cd "$(cat "$run_dir/state/repo" 2>/dev/null)" 2>/dev/null && pwd -P || true)"
  if [[ -z "$top" || "$(cd "$top" && pwd -P)" != "$want" ]]; then
    echo "the server on port $OSRA_PORT serves '${cwd:-unknown}', not this run's checkout '${want:-unknown}'"; return
  fi
  head="$(git -C "$top" rev-parse HEAD)"
  want_head="$(cat "$run_dir/state/head" 2>/dev/null || true)"
  if [[ "$head" != "$want_head" ]]; then
    echo "the server's checkout $top is at ${head:0:7}, not this run's commit ${want_head:0:7} (HEAD moved since launch)"
  fi
}

# Every script that drives the page calls this before it touches the browser.
osra_require_live_server() {
  local why
  why="$(osra_server_problem "$1")"
  [[ -z "$why" ]] && return 0
  {
    echo "REFUSE: $why."
    echo "What http://localhost:$OSRA_PORT shows now is not this run's commit, so nothing was sent to the browser."
    echo "Discard what you observed since your last passing doctor.sh. Run cleanup.sh $1, then launch.sh (it waits for the port) and open-tab.sh on the new RUN_DIR."
  } >&2
  exit 3
}

# The one way to get the run's tab: checks the run dir and the server, then sets OSRA_PAGE.
osra_drivable_page() {
  osra_require_run_dir "${1:-}"
  osra_require_live_server "$1"
  OSRA_PAGE="$(cat "$1/state/page" 2>/dev/null || true)"
  if [[ -z "$OSRA_PAGE" ]]; then
    echo "no tab recorded for this run; open one with: open-tab.sh $1" >&2
    exit 2
  fi
}
