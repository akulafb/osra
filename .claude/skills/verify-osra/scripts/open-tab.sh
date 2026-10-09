#!/usr/bin/env bash
# Open an Orca browser tab for this run and record its page id (doctor, capture and cleanup use it).
# usage: open-tab.sh <run-dir> [path]   e.g. open-tab.sh "$RUN_DIR" /invite/abc
set -euo pipefail
source "$(dirname "$0")/lib.sh"
osra_require_run_dir "${1:-}"
osra_require_live_server "$1"
run_dir="$1"; path="${2:-/}"
if [[ -s "$run_dir/state/page" ]]; then
  echo "this run already owns tab $(cat "$run_dir/state/page"); use orca goto --page <id> to move it" >&2
  exit 1
fi
orca tab create --url "http://localhost:$OSRA_PORT$path" --json \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['browserPageId'])" > "$run_dir/state/page"
page="$(cat "$run_dir/state/page")"
orca wait --page "$page" --load networkidle --json >/dev/null 2>&1 || true
echo "PAGE=$page"
