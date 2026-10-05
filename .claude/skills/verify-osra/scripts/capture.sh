#!/usr/bin/env bash
# Save the run tab's accessibility tree (.aria.txt) and a screenshot (.png) as evidence.
# usage: capture.sh <run-dir> <feature-id> <step-name>
set -euo pipefail
source "$(dirname "$0")/lib.sh"
osra_require_run_dir "${1:-}"
run_dir="$1"; feature="${2:?feature id}"; step="${3:?step name}"
page="$(cat "$run_dir/state/page")"
out="$run_dir/evidence/$feature"
mkdir -p "$out"
base="$out/$(date +%H%M%S)-$step"
orca snapshot --page "$page" --json | python3 -c "
import json,sys
r=json.load(sys.stdin)['result']
open('$base.aria.txt','w').write('# '+r['origin']+'\n'+r['snapshot']+'\n')"
orca screenshot --page "$page" --format png --json | python3 -c "
import base64,json,sys
open('$base.png','wb').write(base64.b64decode(json.load(sys.stdin)['result']['data']))"
echo "$base.aria.txt"
echo "$base.png"
