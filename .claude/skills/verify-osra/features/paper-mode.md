# Paper mode

Paper is the default Canvas Mode: everyone lands on it unless they switched to Cosmos in this browser. In 2D it draws flat ink cards and ink lines on grayscale paper. Hovering a Person rings them and dims everyone but their direct relatives. Selecting a Person ghosts everyone but their relatives. A search dims the non-matches. FIND ME and the current search match get accent rings. INSTRUMENTS, the drawer, the chat, the cards, the banners and the modals take the same paper and ink. Until the Paper 3D scene lands, 3D in Paper shows the Cosmos scene under Paper panels.

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
- 3D in Paper still shows the starfield scene; only its panels are Paper (temporary until the Paper 3D scene lands).
- `hidden` (search non-match) is dimmed in 2D rather than removed, because 2D keeps its layout.
- The Action Handle pills around a selected 2D card are drawn in ink in Paper. Their Cosmos colours are untouched.

## Paper colour and the pair fade (LIN-92)

### Sub-features

- `paper-colour` is the palette button `Paper colour` (aria-pressed) beside COSMOS ⇄ PAPER in CANVAS MODE, in both INSTRUMENTS and on phones, shown only in Paper. Grayscale is the default. Pressing it writes `family-tree-paper-colour` (`colour` or `grayscale`); nothing else writes that key, and the choice survives a reload.
- `paper-pair-fade` (colour on): each load and each closed Person draws a random overview pair that differs from the last one. Selecting a Person fades to their family's pair; a Person with no family keeps the overview pair. The fade is an OKLab blend of about 0.4 s. The scene, INSTRUMENTS, the drawer, the chat, the Ghost Node card and its dashed connector line all follow the `--paper-pair-{paper,ink,accent}` variables on `<html>` (`"r g b"` channels).

### Driving it with ui.sh

- Record `localStorage.getItem('family-tree-paper-colour')` with the other keys, and restore it before cleanup (remove it when it was `null`).
- **Colour.** Open INSTRUMENTS and run `$S/ui.sh "$RUN_DIR" click button "Paper colour"`. The paper turns into a colour pair, the button reads `aria-pressed=true` and the key reads `colour`. `orca reload` keeps colour on with a different overview pair. Click again for grayscale (paper `236 236 234`).
- **Fade.** Before selecting a Person, start an rAF recorder with `orca eval`: each frame push `getComputedStyle(document.documentElement).getPropertyValue('--paper-pair-paper')` into `window.__pairLog`, stopping after 1 s. Then `$S/ui.sh "$RUN_DIR" person <Given> <Family>` and read `window.__pairLog`: the values step from the old pair to the family pair over about 0.4 s.
- **Ghost line.** With a Person selected, click a `+ Child` handle and read `getComputedStyle(document.querySelector('.ghost-node-layer line')).stroke`: it equals the live ink in Paper and the neon relation colour in Cosmos. Close with Escape; submit nothing.
- **Proof.** Capture `paper colour-off`, `paper colour-on`, `paper colour-reload` and `paper focus-fade`.

### Gotchas

- Badran hashes to indigo, which can match the overview pair. Pick a Hajjaj Person to see a change.
- The open chat panel covers the lower-left cards.
- Right after `orca reload` the family picker can ignore Orca clicks. Use a DOM click (`orca eval`) for setup steps.
- Motion needs a visible tab; a throttled tab stalls the fade.
- 2D card fills trail the variables by about 150 ms (NodeCard's own fill transition) and MUI buttons by up to about 170 ms (MUI's transition). Both read the same source.
