#!/bin/bash
# Runs every size and view in Orca's built-in browser (one tab, one run at a time)
# and saves each run's raw window.__result under results/<label>/.
# Usage: run-all.sh <port> <label> [repeat-index]
set -u
PORT=${1:-47813}; LABEL=${2:-dev}; REP=${3:-1}
OUT="$(dirname "$0")/results/$LABEL"; mkdir -p "$OUT"
for spec in ${SPECS:-"2d 8" "2d 1" "paper 8"}; do
  set -- $spec; VIEW=$1; FAM=$2
  for N in 1000 2500 5000; do
    URL="http://127.0.0.1:$PORT/docs/research/canvas-5000/harness.html?n=$N&view=$VIEW&families=$FAM&seed=1"
    orca goto --url "about:blank" --json >/dev/null 2>&1
    orca goto --url "$URL" --json >/dev/null 2>&1
    for i in $(seq 1 450); do
      T=$(orca eval --expression 'document.title' --json 2>/dev/null | grep '"result": "' | sed 's/.*"result": "\(.*\)".*/\1/')
      [ "$T" = "done" ] && break; sleep 2
    done
    orca eval --expression 'JSON.stringify(window.__result)' --json 2>/dev/null | python3 -c 'import sys,json; print(json.dumps(json.loads(json.load(sys.stdin)["result"]["result"]),indent=1))' > "$OUT/${VIEW}-f${FAM}-n${N}-r${REP}.json"
    echo "$VIEW f$FAM n$N -> $(wc -c < "$OUT/${VIEW}-f${FAM}-n${N}-r${REP}.json") bytes"
  done
done
