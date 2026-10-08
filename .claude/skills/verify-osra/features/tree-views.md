# Tree views

A signed-in user explores the family tree in 2D (one family at a time, as a hierarchy) or 3D (all families as a force-directed starfield). The INSTRUMENTS panel holds the view controls; the family picker chooses which family 2D shows.

## Sub-features

- `views-family-pick` selects a family in 2D from SELECT FAMILY; its people render as nodes.
- `views-switch` switches between 2D and 3D from INSTRUMENTS; the choice persists across reloads.
- `views-3d-toggles` toggles AMBIANCE, LABELS, LINKS and ARROWS in 3D.
- `views-canvas-mode` switches between COSMOS and PAPER from CANVAS MODE in INSTRUMENTS, in 2D and 3D (persists once switched; see [Paper mode](./paper-mode.md)).
- `views-collapse` collapses every branch with COLLAPSE ALL.

## How to get to it (user POV)

- Sign in; the tree opens in the last-used mode.
- INSTRUMENTS (top right) opens the control panel; SELECT FAMILY (below it, 2D only) opens the family list.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold and the tab is on `http://localhost:5173/`.
- Starting view mode recorded.

- **Pick a family (2D).** Run `$S/ui.sh "$RUN_DIR" click button "SELECT FAMILY ▾"`, then `$S/ui.sh "$RUN_DIR" pick button "Badran"`. The picker button reads "Badran ▾", the list item reads "Badran✓", and `ui.sh tree` lists node groups whose text is a given name then a family name (e.g. "<Given>" / "Badran").
- **Open instruments.** Run `$S/ui.sh "$RUN_DIR" click button "INSTRUMENTS ▾"`. The button reads "INSTRUMENTS ▴"; the panel shows FIND ME, + ADD PERSON, 3D, 2D, CANVAS MODE (COSMOS / PAPER), SEARCH ARCHIVE, COLLAPSE ALL.
- **Switch to 3D.** Run `$S/ui.sh "$RUN_DIR" click button "3D"`, wait about 6 s for the fly-in. `ui.sh tree` shows switches "AMBIANCE", "LABELS", "LINKS", "ARROWS" and family checkboxes; `localStorage.getItem('family-tree-view-mode')` is `{"mode":"3D","layout":"tree"}`. The screenshot shows planets and links on a starfield (in Paper too, until the Paper 3D scene lands; only the panels change).
- **3D toggle.** Run `$S/ui.sh "$RUN_DIR" click switch "LINKS"`. The switch reads `checked=false` and the screenshot shows nodes without link lines. Click it again to restore.
- **Back to 2D.** Open INSTRUMENTS and run `$S/ui.sh "$RUN_DIR" click button "2D"`. The mode key reads `"2D"` and the empty state "Select a family above to explore, or try the 3D view." returns until a family is picked.
- **Proof.** `capture.sh` after each step: `views 2d-family`, `views 3d`, `views 3d-links-off`, `views 2d-back`.

## Gotchas

- The 3D view is WebGL: nodes have no accessibility handles. Prove 3D with screenshots and the switch states.
- The first seconds of 3D show a "Loading Osra" overlay during the intro fly-in; capture after it clears.
- View mode and Canvas Mode persist in the owner's localStorage (`family-tree-view-mode`, `family-tree-canvas-mode`). Restore the starting values; if the Canvas Mode key was absent, remove it.
- With a large family picked, the 2D view can open framed on lines with no cards in view. FIND ME or selecting a Person brings cards on screen.
- If a person was selected or a search match was active, switching mode carries the selection: the details drawer may open in 3D.
- Family list items exist in the snapshot even with the picker closed; a click on them does nothing until the picker is open and settled.
