# Tree search

Search finds people by name (Arabic or English) among the people currently shown, highlights the current match with a red ring, and steps through matches with a counter.

## Sub-features

- `search-match` typing a name shows a `current/total` counter and rings the first match.
- `search-step` Next and Previous move through matches and wrap around; the counter follows.
- `search-keys` with focus in the box, Enter steps forward, Shift+Enter back (both wrap), Escape clears the query.
- `search-shortcut` Ctrl+F / Cmd+F opens INSTRUMENTS and focuses the search box.
- `search-disabled` in 2D with no family selected the box is disabled with placeholder "Select a family to search".
- In Paper the search adds a `N PEOPLE` / `1 PERSON` count under the counter, Escape deselects before it clears the query, and Paper 3D steps by selecting each match in its cluster; see [Paper search](./paper-mode.md#paper-search-lin-97). Cosmos is as below.

## How to get to it (user POV)

- INSTRUMENTS → SEARCH ARCHIVE box (labelled "Search family tree").
- Ctrl+F / Cmd+F anywhere in the tree.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold, the tab shows the tree in 2D.
- A family is selected (see [tree views](./tree-views.md): `click button "SELECT FAMILY ▾"`, `pick button "Badran"`).
- INSTRUMENTS is open (`click button "INSTRUMENTS ▾"`).

- **Disabled state.** Before selecting a family, `ui.sh tree` shows `textbox "Search family tree" [disabled]` and counter "0/0".
- **Match.** Run `$S/ui.sh "$RUN_DIR" fill textbox "Search family tree" "Zabalawi"`. `ui.sh tree | grep -E '"[0-9]+/[0-9]+"'` shows `1/N` with N ≥ 1, and the screenshot shows one Zabalawi node ringed in red.
- **Step.** Run `$S/ui.sh "$RUN_DIR" click button "Next match"`. The counter reads `2/N` and the ring moves to another Zabalawi node. `click button "Previous match"` returns to `1/N`.
- **Keys.** Run `$S/ui.sh "$RUN_DIR" click textbox "Search family tree"`, then `key Enter`. The counter advances by one, wrapping from `N/N` to `1/N`. `key Shift+Enter` steps back. `key Escape` empties the box and the counter reads `0/0`.
- **Shortcut.** Close INSTRUMENTS, then run `$S/ui.sh "$RUN_DIR" key Control+f`. The button reads "INSTRUMENTS ▴" and `$S/ui.sh "$RUN_DIR" orca eval --expression "String(document.activeElement?.getAttribute('aria-label'))" --json` returns `"Search family tree"`.
- **Proof.** `capture.sh "$RUN_DIR" tree-search match` after the fill and `capture.sh "$RUN_DIR" tree-search step` after Next.

## Gotchas

- Search covers only what is drawn: the selected family in 2D, the visible family checkboxes in 3D. A person outside the view does not match.
- `fill` on the box while INSTRUMENTS is closed types into a hidden field; open the panel first.
- The counter is the reliable assertion; the red ring needs the screenshot. N can exceed the nodes whose text shows the query (Badran/"Zabalawi": 8 matches, 7 nodes showing the name), so assert the counter, not a node count.
- `key` goes to whatever has focus. After clicking Next/Previous, focus is on that button and Enter presses it; click the box first.
- Use `Control+f` for the shortcut; `Meta+f` sent through Orca did not reach the page.
- With the drawer open, the panel sits behind it on the right; close the drawer or capture both.
