#!/usr/bin/env bash
# Tear down what launch.sh and the drive created. Evidence in <run-dir>/evidence survives.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
osra_require_run_dir "${1:-}"
run_dir="$1"

page="$(cat "$run_dir/state/page" 2>/dev/null || true)"
if [[ -n "$page" ]]; then
  index="$(orca tab list --json 2>/dev/null | python3 -c "
import json,sys
tabs=json.load(sys.stdin)['result']['tabs']
print(next((str(t['index']) for t in tabs if t.get('browserPageId')=='$page'),''))" 2>/dev/null)"
  if [[ -n "$index" ]]; then
    orca tab close --index "$index" --json >/dev/null && echo "closed Orca tab $page"
  else
    echo "Orca tab $page already gone"
  fi
fi

pid="$(cat "$run_dir/state/vite.pid" 2>/dev/null || true)"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
  if ps -o command= -p "$pid" | grep -q 'vite'; then
    kill "$pid"
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
    echo "stopped vite pid $pid"
  else
    echo "pid $pid is no longer vite; not killing it"
  fi
fi

rm -rf "$run_dir/state"
echo "evidence kept at $run_dir/evidence"
ls -R "$run_dir/evidence" | head -40
