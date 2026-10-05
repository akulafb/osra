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

holder="$(osra_port_pid)"
if [[ -n "$holder" ]]; then
  echo "REFUSE: port $OSRA_PORT is already held by pid $holder ($(ps -o command= -p "$holder" | cut -c1-120))." >&2
  echo "Do not drive an instance this run did not start. Ask the owner, or reuse it read-only and skip cleanup's kill." >&2
  exit 1
fi

[[ -d node_modules ]] || npm ci

run_id="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
run_dir="$OSRA_VERIFY_ROOT/$run_id"
mkdir -p "$run_dir/state" "$run_dir/evidence"
git rev-parse HEAD > "$run_dir/state/head"
git branch --show-current > "$run_dir/state/branch"
echo "$repo" > "$run_dir/state/repo"

nohup node_modules/.bin/vite --port "$OSRA_PORT" --strictPort > "$run_dir/evidence/vite.log" 2>&1 &
echo $! > "$run_dir/state/vite.pid"

for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "http://localhost:$OSRA_PORT/"; then
    echo "READY http://localhost:$OSRA_PORT  pid $(cat "$run_dir/state/vite.pid")  $(grep -o 'Supabase:.*' "$run_dir/evidence/vite.log" | head -1)"
    echo "RUN_DIR=$run_dir"
    exit 0
  fi
  if ! kill -0 "$(cat "$run_dir/state/vite.pid")" 2>/dev/null; then
    echo "FAILED: vite exited. Log:" >&2; cat "$run_dir/evidence/vite.log" >&2; exit 1
  fi
  sleep 0.5
done
echo "FAILED: no answer on :$OSRA_PORT after 30s. RUN_DIR=$run_dir (run cleanup.sh on it)" >&2
exit 1
