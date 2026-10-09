#!/usr/bin/env bash
# Start the Osra dev server for one verification run.
# Prints RUN_DIR on the last line; pass it to doctor.sh, capture.sh and cleanup.sh.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

repo="$(osra_repo_root)"
cd "$repo"

ref="$(sed -nE 's/^[[:space:]]*VITE_SUPABASE_URL[[:space:]]*=[[:space:]]*"?https:\/\/([a-z0-9]+)\..*/\1/p' .env.local 2>/dev/null | head -1)"
if [[ "$ref" != "$OSRA_DEV_REF" ]]; then
  echo "REFUSE: .env.local points at Supabase '${ref:-missing}', not dev ($OSRA_DEV_REF). Verification never runs against prod." >&2
  exit 1
fi

[[ -d node_modules ]] || npm ci

run_id="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)-$$"   # pid: parallel launches never share a run dir
run_dir="$OSRA_VERIFY_ROOT/$run_id"
mkdir -p "$run_dir/state" "$run_dir/evidence"
git rev-parse HEAD > "$run_dir/state/head"
git branch --show-current > "$run_dir/state/branch"
echo "$repo" > "$run_dir/state/repo"

# The port is the lock: only one run can bind it (--strictPort), and it frees itself when
# that run's vite stops. Wait for it rather than fail, so parallel worktrees take turns.
deadline=$(( $(date +%s) + OSRA_WAIT_SECS ))
while :; do
  holder="$(osra_port_pid)"
  if [[ -n "$holder" ]]; then
    if (( $(date +%s) >= deadline )); then
      echo "REFUSE: port $OSRA_PORT is still held by pid $holder after ${OSRA_WAIT_SECS}s ($(ps -o command= -p "$holder" | cut -c1-120))." >&2
      echo "Do not drive or kill an instance this run did not start. Ask the owner. RUN_DIR=$run_dir (run cleanup.sh on it)" >&2
      exit 1
    fi
    echo "WAIT: port $OSRA_PORT held by pid $holder; retrying until $(date -r "$deadline" +%H:%M:%S)" >&2
    sleep 5
    continue
  fi

  # vite gets its own session, so a tool runner that kills the call's process group when the
  # call ends (AGY's does) leaves it running. macOS has no setsid(1); perl's POSIX::setsid is
  # built in, and exec keeps the pid, so $! is vite's pid.
  perl -MPOSIX -e 'POSIX::setsid() or die "setsid: $!\n"; exec { $ARGV[0] } @ARGV or die "exec $ARGV[0]: $!\n"' \
    node_modules/.bin/vite --port "$OSRA_PORT" --strictPort < /dev/null > "$run_dir/evidence/vite.log" 2>&1 &
  pid=$!
  echo "$pid" > "$run_dir/state/vite.pid"

  for _ in $(seq 1 60); do
    if [[ "$(osra_port_pid)" == "$pid" ]] && curl -fs -o /dev/null "http://localhost:$OSRA_PORT/"; then
      echo "READY http://localhost:$OSRA_PORT  pid $pid  $(grep -o 'Supabase:.*' "$run_dir/evidence/vite.log" | head -1)"
      echo "RUN_DIR=$run_dir"
      exit 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      if grep -q "Port $OSRA_PORT is already in use" "$run_dir/evidence/vite.log"; then
        continue 2   # another run bound the port first; wait for it
      fi
      echo "FAILED: vite exited. Log:" >&2; cat "$run_dir/evidence/vite.log" >&2; exit 1
    fi
    sleep 0.5
  done
  echo "FAILED: no answer on :$OSRA_PORT after 30s. RUN_DIR=$run_dir (run cleanup.sh on it)" >&2
  exit 1
done
