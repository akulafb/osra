# Paper mode

Paper is the default Canvas Mode: everyone lands on it unless they switched to Cosmos in this browser. In 2D it draws flat ink cards and ink lines on grayscale paper. Hovering a Person rings them and dims everyone but their direct relatives. Selecting a Person ghosts everyone but their relatives. A search dims the non-matches. FIND ME and the current search match get accent rings. INSTRUMENTS, the drawer, the chat, the cards, the banners and the modals take the same paper and ink. In 3D, Paper draws its own still scene of ink discs, lines and labels (see [Paper 3D scene](#paper-3d-scene-lin-93)).

## Sub-features

- `paper-default` lands on Paper with no `family-tree-canvas-mode` key, whatever the retired `family-tree-background-theme` holds, and writes no key on load.
- `paper-switch` switches COSMOS ⇄ PAPER from CANVAS MODE in INSTRUMENTS (2D and 3D), keeping 2D/3D, the picked family and the selected Person. It writes the key, and the choice survives a reload.
- `paper-2d` draws flat ink cards, ink lines and grayscale paper.
- `paper-2d-hover` rings the hovered Person, keeps direct relatives (parents, children, spouses) at full ink and dims the rest.
- `paper-2d-focus` draws a heavier ink ring on the selected Person, keeps their relatives and ghosts the rest.
- `paper-2d-marks` draws a solid accent ring for FIND ME and a dashed accent ring for the current search match, and dims non-matches.
- `paper-panels` puts INSTRUMENTS, the drawer (desktop and phone sheet), the chat, the Ghost Node card, the Connect Mode banner and the modals in paper and ink.

## How to get to it (user POV)

- Sign in: the tree opens in Paper unless this browser switched to Cosmos.
- INSTRUMENTS → CANVAS MODE → COSMOS or PAPER.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold, and the run's tab is visible (`orca tab switch --page "$(cat $RUN_DIR/state/page)" --focus`). Emphasis is a 0.15 s fade that stalls in a throttled tab.
- Record `localStorage.getItem('family-tree-canvas-mode')` and `family-tree-background-theme` with `orca eval`, and restore both before cleanup.

- **Default.** Set up with `orca eval ... --expression "localStorage.removeItem('family-tree-canvas-mode'); localStorage.setItem('family-tree-background-theme','wax-white')"`, then `orca reload`. The page is light grey, CANVAS MODE shows PAPER pressed (`button[aria-pressed=true]`), and the canvas-mode key is still `null`.
- **Switch.** Pick a family, run `$S/ui.sh "$RUN_DIR" person <Given> <Family>`, open INSTRUMENTS, then run `$S/ui.sh "$RUN_DIR" click button "COSMOS"`. The page turns dark with neon cards, and the same person stays selected with the drawer open. The key reads `cosmos`; `orca reload` keeps Cosmos. Click `PAPER` to return.
- **Cards on screen.** A large family can open framed on lines only. Open INSTRUMENTS and click `FIND ME`, or select a Person.
- **Hover.** Find the card's ref with `ui.sh tree` (a `group` before the given name), then run `orca hover --page "$(cat $RUN_DIR/state/page)" --element <ref>`. Read `getComputedStyle(card).opacity` for the `.node-card` groups: the hovered Person and their direct relatives are `1`, everyone else `0.4`.
- **Focus.** `$S/ui.sh "$RUN_DIR" person <Given> <Family>`. The selected Person and their relatives are `1`, everyone else `0.18`.
- **Search.** `$S/ui.sh "$RUN_DIR" fill textbox "Search family tree" "<text>"`, then click `Next match` until a match is on screen. Non-matches are `0.4` and the current match has a dashed accent ring.
- **Panels.** Open the drawer, the chat (`🤖`), `Edit Registry` (then `Cancel`), a `+ Child` handle (Ghost Node card, closed with Escape in its textbox) and `🔗 Link` (Connect Mode banner, then `Cancel (Esc)`). Submit nothing.
- **Proof.** Capture `paper default`, `paper switch-cosmos`, `paper hover`, `paper focus`, `paper findme`, `paper search` and `paper panels`.

## Gotchas

- Paper is the default, so a run that leaves no `family-tree-canvas-mode` key leaves the owner on Paper. That is the intended start state, not a leak.
- `hidden` (search non-match) is dimmed in 2D rather than removed, because 2D keeps its layout.
- The Action Handle pills around a selected 2D card are drawn in ink in Paper. Their Cosmos colours are untouched.

## Paper colour and the pair fade (LIN-92)

### Sub-features

- `paper-colour` is the palette button `Paper colour` (aria-pressed) beside COSMOS ⇄ PAPER in CANVAS MODE, in both INSTRUMENTS and on phones, shown only in Paper. Grayscale is the default. Pressing it writes `family-tree-paper-colour` (`colour` or `grayscale`); nothing else writes that key, and the choice survives a reload.
- `paper-pair-fade` (colour on): each load and each closed Person draws a random overview pair that differs from the last one. Selecting a Person fades to their family's pair; a Person with no family keeps the overview pair. The fade is an OKLab blend of about 0.4 s. The scene, INSTRUMENTS, the drawer, the chat, the Ghost Node card and its dashed connector line all follow the `--paper-pair-{paper,ink,accent}` variables on `<html>` (`"r g b"` channels).

### Driving it with ui.sh

- Record `localStorage.getItem('family-tree-paper-colour')` with the other keys, and restore it before cleanup (remove it when it was `null`). The tab also keeps the last overview pair's index in sessionStorage `family-tree-paper-overview-pair`; it dies with the tab.
- **Colour.** Open INSTRUMENTS and run `$S/ui.sh "$RUN_DIR" click button "Paper colour"`. The paper turns into a colour pair, the button reads `aria-pressed=true` and the key reads `colour`. `orca reload` keeps colour on with a different overview pair. Click again for grayscale (paper `236 236 234`).
- **Fade.** Before selecting a Person, start an rAF recorder with `orca eval`: each frame push `getComputedStyle(document.documentElement).getPropertyValue('--paper-pair-paper')` into `window.__pairLog`, stopping after 1 s. Then `$S/ui.sh "$RUN_DIR" person <Given> <Family>` and read `window.__pairLog`: the values step from the old pair to the family pair over about 0.4 s.
- **Ghost line.** With a Person selected, click a `+ Child` handle and read `getComputedStyle(document.querySelector('.ghost-node-layer line')).stroke`: in Paper it is the live ink at the relation's alpha (parent 1, spouse 0.85, child 0.7, sibling 0.6), in Cosmos the neon relation colour. Close with Escape; submit nothing.
- **Proof.** Capture `paper colour-off`, `paper colour-on`, `paper colour-reload` and `paper focus-fade`.

### Gotchas

- Badran hashes to indigo, which can match the overview pair. Pick a Hajjaj Person to see a change.
- The open chat panel covers the lower-left cards.
- Right after `orca reload` the family picker can ignore Orca clicks. Use a DOM click (`orca eval`) for setup steps.
- Motion needs a visible tab; a throttled tab stalls the fade.
- 2D card fills trail the variables by up to 200 ms (NodeCard's own `all 0.2s` transition) and MUI buttons by up to about 170 ms (MUI's transition). Both read the same source.

## Paper 3D scene (LIN-93)

### Sub-features

- `paper-3d` draws every shown Person as a flat ink disc that faces the camera, larger with more Kinship Links, on grayscale paper. The layout is still: nothing drifts. Labels are uppercase monospace (bundled Kawkab Mono, Arabic too), bigger and bolder on larger discs, and fade with distance. Parent lines are thin and grey, marriages thick ink, divorces dashed ink. No planet textures, starfield or family bubbles; INSTRUMENTS has no TEXTURE or FAMILY PRESETS.
- `paper-3d-click` selects the clicked Person: the drawer opens (desktop side drawer, phone bottom sheet). A pointer that moves more than 6 px is a camera drag, not a click. Clicking empty paper or pressing Escape clears the selection.
- `paper-3d-stable` keeps the layout for the whole page load: switching to Cosmos or 2D and back shows the same positions.
- `paper-3d-no-webgl` shows "THE 3D TREE NEEDS WEBGL" in place of the canvas when WebGL is missing; INSTRUMENTS still works.

### Driving it with ui.sh

- Record the view-mode and canvas-mode keys. In Paper, open INSTRUMENTS and click `3D`. Wait until `document.body.innerText.includes('Loading Osra')` is false.
- **Overview.** `capture.sh` after two identical consecutive captures. Expect ink discs, Arabic and Latin labels, and the three line styles.
- **Click.** Nodes have no accessibility handles: pick an isolated disc from the screenshot (PNG pixels ÷ 2 at the 879 px tab) and run `$S/ui.sh "$RUN_DIR" tap <x> <y>`. The drawer heading is the Person's name (`.MuiDrawer-paper h4`). Below 1024 px wide (the Orca tab) it is the phone bottom sheet.
- **Escape.** Probe first with `window.addEventListener('keydown', …)`, then `$S/ui.sh "$RUN_DIR" key Escape`; `.MuiDrawer-paper h4` disappears.
- **Stable layout.** Capture, switch CANVAS MODE to `COSMOS` and back to `PAPER`, close INSTRUMENTS and capture again: the scene pixels match.
- **No WebGL.** Go to 2D, then `orca eval` `HTMLCanvasElement.prototype.getContext` to return `null` for `webgl*` (keep the original on `window`), then click `3D`. The `role=alert` fallback shows. Restore `getContext` afterwards.
- **Proof.** Capture `paper-3d overview`, `paper-3d click`, `paper-3d escape`, `paper-3d switch-before`, `paper-3d switch-cosmos`, `paper-3d switch-after` and `paper-3d no-webgl`.

### Gotchas

- An occluded Orca tab runs no `requestAnimationFrame`, so the layout never starts and "Loading Osra" stays. Each `orca screenshot` forces a frame: take a few to pump it, or bring Orca forward.
- The Orca tab is 879 px wide, under the 1024 px `isMobile()` cutoff, so the desktop side drawer and NAV CONTROLS can't be reached. `orca set device` offers only phones taller than the pane, and their screenshots repeat the top ~540 px: prove the phone sheet with `.MuiDrawer-paper` `getBoundingClientRect()` instead. Device emulation clears on reload.
- `orca keypress Meta+f` does not reach the page; dispatch `new KeyboardEvent('keydown', { key: 'f', metaKey: true })` on `window` and say so.

## Paper 3D in colour (LIN-93 pass 93d)

### Sub-features

- `paper-3d-colour` paints the grayscale scene in the live Paper Pair with a duotone pass (`PaperDuotone`): scene ink becomes the pair's ink, scene paper the pair's paper, and greys in between (parent lines, fog, label edges) land in between. With colour off it is an identity: discs, lines and labels are exactly `#1c1c1c` and the paper `236 236 234`. The scene renders untone-mapped, so far discs and lines fog fully into the paper.
- `paper-3d-fade` fades the scene with the panels: focusing a Person or closing one moves the composer's colours each frame in step with `--paper-pair-*`. INSTRUMENTS (toggle, + ADD PERSON, switch labels, VISIBILITY header and checkboxes), the search counter, the drawer's hover states and the 2D empty state read live pair tokens, so none of them snap.
- `paper-connect-accent`: the Connect picker's selected choice in Paper is the pair's accent at 20%, not ink. Only grayscale has an accent (`#c8361d`) that differs from ink.

### Driving it with ui.sh

- **Colour.** In Paper 3D open INSTRUMENTS and click `Paper colour`. The scene turns into the overview pair. Sample the canvas pixels of a screenshot: the background equals `--paper-pair-paper` and the discs `--paper-pair-ink`.
- **Fade.** A per-frame proof needs a probe on the composer (a temporary `useFrame` at priority 2 in `PaperDuotone` that reads the `paper` uniform and `gl.readPixels` a corner pixel into `window.__duoLog`; never commit it). Record `--paper-pair-paper` and the INSTRUMENTS button colour in the same rAF loop, then tap a disc. Every frame the uniform, the read-back pixel and the variable agree.
- **Fog.** Open INSTRUMENTS and click `FIND ME`: the camera flies to the owner. The nearest lines are full ink; lines and discs at the back are lighter. Mouse-wheel zoom right into the orbit target fogs everything out, because the fog scales with the distance to the target.
- **Connect accent.** Grayscale, 2D, a family picked, a Person selected: DOM-click `.handle-connect` (`🔗 Link`), DOM-click another `.node-card`, then click a choice. Its computed background is `color(srgb 0.784 0.212 0.114 / 0.2)`. Leave with the picker's `Cancel` (next to `Establish Link`), then `Cancel (Esc)`. Never click `Establish Link`.
- **Cosmos unchanged.** Diff a computed-style fingerprint of every element (Cosmos 2D with INSTRUMENTS open; Cosmos 3D with INSTRUMENTS and VISIBILITY open) and the drawer's `+ Add Relative` / `Invite to Tree` hover colours, between the base files and the branch, after a reload each time.
- **Proof.** Capture `paper-3d-duotone grayscale`, `colour-on-overview`, `focus-<person>`, `fog-near-far` and `paper-connect picker-accent`.

### Gotchas

- An occluded Orca window runs about 1-3 rAF a second, so a 0.4 s fade shows up as 2 or 3 frames. To see the steps, slow the page clock for the recording (wrap `performance.now` and the rAF timestamp at 1/20 speed with `orca eval`), and say so in the report.
- `Next match` in Paper 3D does not fly the camera; `FIND ME` does.
- In the phone sheet, the drawer's buttons sit high: a tap meant to focus the page can land on `+ Add Relative` and open its modal. Tap the heading text (`.MuiDrawer-paper h4`) instead, and Cancel any modal that opens.

