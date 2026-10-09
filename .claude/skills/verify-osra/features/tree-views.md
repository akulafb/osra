# Tree views

A signed-in user explores the family tree in 2D (one family at a time, as a hierarchy) or 3D (all families: a force-directed starfield in Cosmos, a still ink scene in Paper). The INSTRUMENTS panel holds the view controls; the family picker chooses which family 2D shows.

## Sub-features

- `views-family-pick` selects a family in 2D from SELECT FAMILY; its people render as nodes.
- `views-switch` switches between 2D and 3D from INSTRUMENTS; the choice persists across reloads.
- `views-3d-toggles` toggles LABELS, LINKS and ARROWS in 3D, plus AMBIANCE in Cosmos only (Paper has none, see [Paper mode](./paper-mode.md#paper-3d-scene-lin-93)).
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
- **Open instruments.** Run `$S/ui.sh "$RUN_DIR" click button "INSTRUMENTS ▾"`. The button reads "INSTRUMENTS ▴"; the panel shows FIND ME, + ADD PERSON, 3D, 2D, CANVAS MODE (COSMOS / PAPER, plus the `Paper colour` palette toggle beside it, Paper only, 2D and 3D, phones too), SEARCH ARCHIVE, COLLAPSE ALL.
- **Switch to 3D.** Run `$S/ui.sh "$RUN_DIR" click button "3D"`. In Cosmos, wait about 6 s for the fly-in; in Paper (the default), wait for the loader as [Paper mode](./paper-mode.md#paper-3d-scene-lin-93) says (`Loading Osra` gone, or the titled loader after a reload). `ui.sh tree` shows switches "LABELS", "LINKS", "ARROWS" (plus "AMBIANCE" in Cosmos only) and family checkboxes; `localStorage.getItem('family-tree-view-mode')` is `{"mode":"3D","layout":"tree"}`. In Cosmos the screenshot shows planets and links on a starfield; in Paper it shows ink discs on grey paper (see [Paper mode](./paper-mode.md#paper-3d-scene-lin-93)).
- **3D toggle.** Run `$S/ui.sh "$RUN_DIR" click switch "LINKS"`. The switch reads `checked=false` and the screenshot shows nodes without link lines. Click it again to restore.
- **Back to 2D.** Open INSTRUMENTS and run `$S/ui.sh "$RUN_DIR" click button "2D"`. The mode key reads `"2D"` and the empty state "Select a family above to explore, or try the 3D view." returns until a family is picked.
- **Proof.** `capture.sh` after each step: `views 2d-family`, `views 3d`, `views 3d-links-off`, `views 2d-back`.

## Gotchas

- The 3D view is WebGL: nodes have no accessibility handles. Prove 3D with screenshots and the switch states.
- Cosmos only: the first seconds of 3D show a "Loading Osra" overlay during the intro fly-in; capture after it clears. Paper 3D has its own loaders (see [Paper mode](./paper-mode.md#paper-3d-scene-lin-93) and its [intro](./paper-mode.md#paper-3d-intro-and-hint-lin-95-pass-95b)).
- View mode and Canvas Mode persist in the owner's localStorage (`family-tree-view-mode`, `family-tree-canvas-mode`, `family-tree-paper-colour`: `colour` or `grayscale`, absent means grayscale). Restore the starting values; if the Canvas Mode or Paper colour key was absent, remove it. sessionStorage `family-tree-paper-overview-pair` dies with the tab.
- With a large family picked, the 2D view can open framed on lines with no cards in view. FIND ME or selecting a Person brings cards on screen. FIND ME in 2D centres on the owner but does not select them; select with `ui.sh person <Given> <Family>`.
- If a person was selected or a search match was active, switching mode carries the selection: the details drawer may open in 3D.
- Family list items exist in the snapshot even with the picker closed; a click on them does nothing until the picker is open and settled.
