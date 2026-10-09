# Person details

Selecting a person opens a details drawer with their given name, family, ID and the actions the signed-in user may take on them; in 2D the node also grows action pills. From 900px wide the drawer is a 400px panel on the right and the right-docked controls (INSTRUMENTS, the family picker, AMBIANCE, NAV CONTROLS, See who's new) move left of it; below 900px it is a bottom sheet and those controls stay above it, scrolling when they do not fit. While the sheet is open the family chat (🤖 button and panel, bottom-left) sits behind it and comes back on top when the sheet closes; beside the side panel the chat stays on top.

## Sub-features

- `person-select` clicking a node outlines it and opens the drawer.
- `person-drawer` the drawer shows the given name as a heading, "<FAMILY> FAMILY", and "ID: <uuid>".
- `person-actions` the drawer lists Edit Registry, + Add Relative, Invite to Tree and, for admins, ADMINISTRATIVE TOOLS (Connect Nodes..., Manage Links, Delete Entry).
- `person-close` the drawer's close icon (`button "Close details"`), Escape, or clicking empty tree space deselects the person and closes the drawer.
- `person-clear` no control draws over the open drawer, in 2D and 3D, side panel or sheet; the chat goes behind the sheet only.

## How to get to it (user POV)

- Click a person in the 2D tree.
- In 3D, click a Person (an ink disc in Paper, a planet in Cosmos), or Tab through people and press Enter.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold; 2D with a family selected (e.g. Badran).

- **Select.** Take any person from `ui.sh tree` (a node group's two text lines: given name, then family) and run `$S/ui.sh "$RUN_DIR" person <Given> Badran`. `ui.sh tree` starts with `heading "<Given>" [level=4]` followed by buttons "Edit Registry", "+ Add Relative", "Invite to Tree"; the screenshot shows the node outlined in white with + Parent / + Spouse / + Child pills, and the drawer reads "BADRAN FAMILY".
- **Cross-check.** The drawer's `ID:` value matches the person in the dev DB: Supabase MCP `execute_sql` on `djwqamcfllqziqiyvyjj`, `SELECT first_name, paternal_family_cluster FROM nodes WHERE id = '<id from the screenshot>';`.
- **Select by keyboard.** Tap empty canvas to give the page focus, then press Tab: `$S/ui.sh "$RUN_DIR" tap 300 700` then `$S/ui.sh "$RUN_DIR" key Tab`. Tab selects the next person and pans to them, so it works even when the tree is off-screen. In 3D, a tap fires a background click a moment later; if the drawer does not open, press Tab again.
- **Close icon.** Run `$S/ui.sh "$RUN_DIR" click button "Close details"`. `ui.sh tree` no longer contains `button "Close details"`. To prove nothing covers it, hit-test its centre: `$S/ui.sh "$RUN_DIR" orca eval --expression "(() => { const b=document.querySelector('button[aria-label=\"Close details\"]'); const r=b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)); })()" --json` returns `true`, also with INSTRUMENTS open.
- **Chat and sheet.** In the 390px iframe (Gotchas), select a person and hit-test the chat button's centre inside the iframe: `elementFromPoint` there lands inside `.MuiDrawer-paper` (z-index 1200), and the chat's fixed root has z-index 1100. Close the sheet: the same point hits the 🤖 button, the root is back at 10000, and a `tap` there opens the panel. With the panel open, select again: the sheet covers the panel's lower part (its input) and the panel's top stays visible above it. In the 930px side layout the chat root stays at 10000 and the 🤖 button hits itself with the drawer open.
- **Escape.** Reselect, tap empty space inside the drawer to give the page focus (`$S/ui.sh "$RUN_DIR" tap 830 780` at the default viewport), then `$S/ui.sh "$RUN_DIR" key Escape`. The close button is gone.
- **Empty space.** Run `$S/ui.sh "$RUN_DIR" tap 250 650` (left half, below the first row; check the screenshot that the spot is empty). The close button is gone.
- **Proof.** `capture.sh "$RUN_DIR" person-details open` after selecting and `capture.sh "$RUN_DIR" person-details closed` after each close.

## Gotchas

- Every action button here writes to the Tree Record. Assert the buttons exist; leave them unclicked.
- Keys reach the page only while it has focus, and it loses focus between commands. `ui.sh key` refuses when the page has no focus; tap a spot that changes nothing first.
- The Orca viewport (about 930px) is above 900px, so it shows the side panel. For the bottom sheet, load the app in a same-origin iframe narrower than 900px (390px for a phone) (it shares the session): `orca eval --expression "(() => { const f=document.createElement('iframe'); f.id='phone'; f.src='/'; Object.assign(f.style,{position:'fixed',left:'0',top:'0',width:'390px',height:'812px',zIndex:2147483647,border:'0'}); document.body.appendChild(f); return 'ok'; })()"`, drive it with `tap` at the same coordinates, read it through `document.getElementById('phone').contentDocument`, and remove it before cleanup. A tap inside the iframe does not give it focus, so Tab goes nowhere: tap the outer page outside the iframe (e.g. `tap 650 1000`), then as setup run `document.getElementById('phone').contentWindow.focus()` (blur any focused button in it), then send the key with `orca keypress --page ... --key Tab` (ui.sh `key` checks the outer page's focus, which the iframe takes). A 1100px iframe with `transform: scale(0.8)` shows the desktop layout (`isMobile()` is true up to 1024px); taps are then in scaled page pixels. Switching view mode inside the iframe changes the owner's persisted mode too.
- `orca mouse wheel` does not scroll anything in Orca's browser, so a scrolling column cannot be proven by wheel; set `scrollTop` as setup and capture what it reveals.
- `person` needs the exact given and family names as shown in the node; Arabic names work as written.
- 3D picking has no accessibility handle; reach a person there through search (a search match selects it) or Tab/Enter, and prove by the drawer heading.
