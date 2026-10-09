#!/usr/bin/env bash
# Drive the run's Orca tab by accessible role + name instead of positional refs.
# usage:
#   ui.sh <run-dir> tree                          print the current accessibility tree
#   ui.sh <run-dir> find  <role> <name>           print the ref of the first exact match
#   ui.sh <run-dir> click <role> <name>           click it (must already be on screen)
#   ui.sh <run-dir> pick  <role> <name>           scroll an item of an open scrollable menu into view, then click
#   ui.sh <run-dir> person <given> [family]       click a person node in the 2D tree (e.g. person <Given> Badran)
#   ui.sh <run-dir> fill  <role> <name> <value>   fill a textbox/searchbox
#   ui.sh <run-dir> tap   <x> <y>                 click at CSS-pixel coordinates (empty canvas, WebGL)
#   ui.sh <run-dir> key   <key>                   press a key in the page (Enter, Escape, Tab, Meta+f); refuses unless the page has focus
#   ui.sh <run-dir> goto  <path>                  navigate to http://localhost:5173<path>
#   ui.sh <run-dir> wait-text <text>              wait until text is on the page
#   ui.sh <run-dir> orca <command> [args...]      any other orca browser command on the run's tab (adds --page)
# Name matching is exact; prefix the name with ~ for a substring match (e.g. "~Badran").
set -euo pipefail
source "$(dirname "$0")/lib.sh"
osra_drivable_page "${1:-}"   # refuses unless port 5173 still serves this run's vite at its commit
page="$OSRA_PAGE"; cmd="${2:?command}"; shift 2

find_ref() {
  orca snapshot --page "$page" --json | python3 -c "
import json,sys
role,name=sys.argv[1],sys.argv[2]
refs=json.load(sys.stdin)['result']['refs']
def hit(r):
    if r['role']!=role: return False
    return name[1:] in r['name'] if name.startswith('~') else r['name']==name
m=sorted((k for k,r in refs.items() if hit(r)),key=lambda k:int(k[1:]))
if not m: sys.exit('no %s named %r on the page (run: ui.sh <run-dir> tree)'%(role,name))
print('@'+m[0])" "$1" "$2"
}

# Person nodes are unnamed groups whose text children are the given name then the family name.
find_person() {
  orca snapshot --page "$page" --json | python3 -c "
import json,re,sys
want=[w for w in sys.argv[1:] if w]
lines=json.load(sys.stdin)['result']['snapshot'].splitlines()
for i,l in enumerate(lines):
    m=re.match(r'(\s*)- group \[ref=(e\d+)\]',l)
    if not m: continue
    texts=[]
    for nxt in lines[i+1:i+4]:
        t=re.match(r'\s*- StaticText \"(.*)\"$',nxt)
        if t: texts.append(t.group(1))
    if texts[:len(want)]==want: print('@'+m.group(2)); sys.exit()
sys.exit('no person node %r on the page (is a family selected? run: ui.sh <run-dir> tree)'%' '.join(want))" "$@"
}

case "$cmd" in
  tree) orca snapshot --page "$page" --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['snapshot'])" ;;
  find) find_ref "$1" "$2" ;;
  click) orca click --page "$page" --element "$(find_ref "$1" "$2")" --json >/dev/null && echo "clicked $1 '$2'" ;;
  pick)
    # For items inside a scrollable menu (SELECT FAMILY): scroll the item into view, then click.
    # Never use on controls in a collapsed panel: scrolling those pans the whole app off-screen.
    sleep 1.5  # let the menu's open animation finish; a click mid-animation lands on nothing
    ref="$(find_ref "$1" "$2")"
    orca scrollintoview --page "$page" --element "$ref" --json >/dev/null
    orca click --page "$page" --element "$ref" --json >/dev/null && echo "picked $1 '$2'" ;;
  fill) orca fill --page "$page" --element "$(find_ref "$1" "$2")" --value "$3" --json >/dev/null && echo "filled $1 '$2'" ;;
  person) orca click --page "$page" --element "$(find_person "$1" "${2:-}")" --json >/dev/null && echo "clicked person '$1 ${2:-}'" ;;
  tap)
    orca mouse move --page "$page" --x "$1" --y "$2" --json >/dev/null
    orca mouse down --page "$page" --json >/dev/null
    orca mouse up --page "$page" --json >/dev/null && echo "tapped $1,$2" ;;
  key)
    focused="$(orca eval --page "$page" --expression "document.hasFocus()" --json | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['result'])")"
    if [[ "$focused" != "True" && "$focused" != "true" ]]; then
      echo "REFUSE: the page does not have focus, so '$1' would go nowhere. Tap a spot that changes nothing first (e.g. empty space inside the drawer), then retry." >&2
      exit 1
    fi
    orca keypress --page "$page" --key "$1" --json >/dev/null && echo "pressed $1" ;;
  goto) orca goto --page "$page" --url "http://localhost:$OSRA_PORT$1" --json >/dev/null && echo "at $1" ;;
  wait-text) orca wait --page "$page" --text "$1" --json >/dev/null && echo "saw '$1'" ;;
  orca) orca "$@" --page "$page" ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
