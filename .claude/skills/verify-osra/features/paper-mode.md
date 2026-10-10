# Paper mode

Paper is the default Canvas Mode: everyone lands on it unless they switched to Cosmos in this browser. In 2D it draws flat ink cards and ink lines on the paper: grayscale, or the live Paper Pair with Paper colour on (see [Paper colour](#paper-colour-and-the-pair-fade-lin-92)). Hovering a Person rings them and dims everyone but their direct relatives. Selecting a Person ghosts everyone but their relatives. A search dims the non-matches. FIND ME and the current search match get accent rings. INSTRUMENTS, the drawer, the chat, the cards, the banners and the modals take the same paper and ink. In 3D, Paper draws its own scene of ink discs, lines and labels in a still layout (see [Paper 3D scene](#paper-3d-scene-lin-93)); the camera glides, turns slowly when idle and zooms toward the cursor (see [Paper 3D camera and effects](#paper-3d-camera-and-effects-lin-95-pass-95a)). The page's first Paper 3D load opens with a titled loader and a reveal, and a one-time controls hint (see [intro](#paper-3d-intro-and-hint-lin-95-pass-95b)). WASD and Q/E fly the Paper camera, and a double-click collapses a parent's branch (see [navigation](#paper-3d-navigation-and-collapse-lin-96-pass-96d)). A search in Paper 3D shrinks the non-matches away and gathers the matches into a cluster (see [search](#paper-3d-search-lin-97-pass-97a)).

## Sub-features

- `paper-default` lands on Paper with no `family-tree-canvas-mode` key, whatever the retired `family-tree-background-theme` holds, and writes no key on load.
- `paper-switch` switches COSMOS ⇄ PAPER from CANVAS MODE in INSTRUMENTS (2D and 3D), keeping 2D/3D, the picked family and the selected Person. It writes the key, and the choice survives a reload.
- `paper-2d` draws flat ink cards and ink lines on the paper: grayscale, or the live Paper Pair with `paper-colour` on.
- `paper-2d-hover` rings the hovered Person, keeps direct relatives (parents, children, spouses) at full ink and dims the rest.
- `paper-2d-focus` draws a heavier ink ring on the selected Person, keeps their relatives and ghosts the rest.
- `paper-2d-marks` draws a solid accent ring for FIND ME and a dashed accent ring for the current search match, and dims non-matches (`0.12`, below a ghosted match's `0.18`, so a selection never makes a non-match outshine a match).
- `paper-2d-lifecycles`: Spawn's ring and sparkles and Dissolve's debris are plain ink with no glow, and the `Delete?` confirmation pill has no red glow. Cosmos keeps its colours and glows.
- `paper-panels` puts INSTRUMENTS, the drawer (desktop and phone sheet), the chat, the Ghost Node card, the Connect Mode banner and the modals in paper and ink.

## How to get to it (user POV)

- Sign in: the tree opens in Paper unless this browser switched to Cosmos.
- INSTRUMENTS → CANVAS MODE → COSMOS or PAPER.

## Driving it with ui.sh

Preconditions:

- Baseline preconditions hold, and the run's tab is visible (`$S/ui.sh "$RUN_DIR" orca tab switch --focus`). Emphasis is a 0.15 s fade that stalls in a throttled tab.
- Record `localStorage.getItem('family-tree-canvas-mode')` and `family-tree-background-theme` with `orca eval`, and restore both before cleanup.

- **Default.** Set up with `$S/ui.sh "$RUN_DIR" orca eval --expression "localStorage.removeItem('family-tree-canvas-mode'); localStorage.setItem('family-tree-background-theme','wax-white')" --json`, then `$S/ui.sh "$RUN_DIR" orca reload`. The page is light grey, CANVAS MODE shows PAPER pressed (`button[aria-pressed=true]`), and the canvas-mode key is still `null`.
- **Switch.** Pick a family, run `$S/ui.sh "$RUN_DIR" person <Given> <Family>`, open INSTRUMENTS, then run `$S/ui.sh "$RUN_DIR" click button "COSMOS"`. The page turns dark with neon cards, and the same person stays selected with the drawer open. The key reads `cosmos`; `orca reload` keeps Cosmos. Click `PAPER` to return.
- **Cards on screen.** A large family can open framed on lines only. Open INSTRUMENTS and click `FIND ME`, or select a Person.
- **Hover.** Find the card's ref with `ui.sh tree` (a `group` before the given name), then run `$S/ui.sh "$RUN_DIR" orca hover --element <ref>`. Read `getComputedStyle(card).opacity` for the `.node-card` groups: the hovered Person and their direct relatives are `1`, everyone else `0.4`.
- **Focus.** `$S/ui.sh "$RUN_DIR" person <Given> <Family>`. The selected Person and their relatives are `1`, everyone else `0.18`.
- **Search.** `$S/ui.sh "$RUN_DIR" fill textbox "Search family tree" "<text>"`, then click `Next match` until a match is on screen. Non-matches are `0.12`, every card keeps its `transform`, and the current match has a dashed accent ring. The count under the bar reads `N PEOPLE` (`1 PERSON` for one). With a Person selected, the first Escape deselects and the second clears the search (see [Paper search](#paper-search-lin-97)).
- **Panels.** Open the drawer, the chat (`🤖`), `Edit Registry` (then `Cancel`), a `+ Child` handle (Ghost Node card, closed with Escape in its textbox) and `🔗 Link` (Connect Mode banner, then `Cancel (Esc)`). Submit nothing.
- **Proof.** Capture `paper default`, `paper switch-cosmos`, `paper hover`, `paper focus`, `paper findme`, `paper search` and `paper panels`.

## Gotchas

- Paper is the default, so a run that leaves no `family-tree-canvas-mode` key leaves the owner on Paper. That is the intended start state, not a leak.
- `hidden` (search non-match) is dimmed in 2D rather than removed, because 2D keeps its layout.
- The Action Handle pills around a selected 2D card are drawn in ink in Paper. Their Cosmos colours are untouched.
- Paper 2D cards (`.node-card`) and `.handle-connect` are SVG, so `el.click()` is not a function. Dispatch a bubbling `click` (`el.dispatchEvent(new MouseEvent('click', { bubbles: true }))`) instead.

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

- `paper-3d` draws every shown Person as a flat ink disc that faces the camera, larger with more Kinship Links, on grayscale paper. The layout is still: no Person drifts on its own (a hover leans relatives in on top of it, see [Paper 3D hover](#paper-3d-hover-lin-94-pass-94a)), though the idle camera turns the whole view. Labels are uppercase monospace (bundled Kawkab Mono, Arabic too), bigger and bolder on larger discs, and fade with distance. Parent lines are thin and grey, marriages thick ink, divorces dashed ink. No planet textures, starfield or family bubbles; INSTRUMENTS has no TEXTURE or FAMILY PRESETS.
- `paper-3d-click` selects the clicked Person: the drawer opens (desktop side drawer, phone bottom sheet). A pointer that moves more than 6 px is a camera drag, not a click. Clicking empty paper (up to 6 px of movement) or pressing Escape clears the selection.
- `paper-3d-stable` keeps the layout for the whole page load: switching to Cosmos or 2D and back shows the same positions.
- `paper-3d-no-webgl` shows "THE 3D TREE NEEDS WEBGL" in place of the canvas when WebGL is missing, the renderer throws, the layout throws or the WebGL context is lost; INSTRUMENTS still works. The WebGL check runs once per page and gives its context back, so switching Paper and Cosmos never logs "Too many active WebGL contexts".
- `paper-3d-unwired`: Paper 3D has no AMBIANCE toggle (Cosmos-only: the Paper focus tap always plays, product decision 10). Cosmos 3D keeps it. NAV CONTROLS lists Paper's own keys (see [Paper 3D navigation](#paper-3d-navigation-and-collapse-lin-96-pass-96d)). The drawer's `Connect Nodes...` is back in Paper 3D (see [Paper 3D editing](#paper-3d-editing-lin-96-passes-96a-to-96c)).

### Driving it with ui.sh

- Record the view-mode and canvas-mode keys. In Paper, open INSTRUMENTS and click `3D`. Wait until `document.body.innerText.includes('Loading Osra')` is false. After a reload into Paper 3D the loader is the titled one instead (see [intro](#paper-3d-intro-and-hint-lin-95-pass-95b)): wait until `document.querySelector('[role=status][aria-label=Loading]')` is gone.
- **Overview.** `capture.sh` once the loader is gone. The grain and the idle turn mean no two captures match. Expect ink discs, Arabic and Latin labels, and the three line styles.
- **Click.** Nodes have no accessibility handles: pick an isolated disc from the screenshot (PNG pixels ÷ 2 at the 879 px tab) and run `$S/ui.sh "$RUN_DIR" tap <x> <y>`. The drawer heading is the Person's name (`.MuiDrawer-paper h4`). Below 900 px wide (MUI `md`, `useIsDrawerSheet`; the 879 px Orca tab too) it is the phone bottom sheet.
- **Escape.** Probe first with `window.addEventListener('keydown', …)`, then `$S/ui.sh "$RUN_DIR" key Escape`; `.MuiDrawer-paper h4` disappears.
- **Stable layout.** Capture, switch CANVAS MODE to `COSMOS` and back to `PAPER`, close INSTRUMENTS and capture again: the same Persons sit in the same places relative to each other (the idle turn and the grain change the pixels).
- **Background tap.** With a Person selected, press on empty paper, move 4 px and release (`$S/ui.sh "$RUN_DIR" orca mouse move --x <x> --y <y>`, `$S/ui.sh "$RUN_DIR" orca mouse down`, `$S/ui.sh "$RUN_DIR" orca mouse move --x <x+4> --y <y>`, `$S/ui.sh "$RUN_DIR" orca mouse up`): the drawer closes. The same with a 20 px move is a camera drag and keeps it.
- **Unwired controls.** In Paper 3D with INSTRUMENTS open: `AMBIANCE` is absent from `document.body.innerText`; Cosmos 3D shows it.
- **No WebGL.** The WebGL check runs once per page, so reload first, go to 2D, then `orca eval` `HTMLCanvasElement.prototype.getContext` to return `null` for `webgl*` (keep the original on `window`), then click `3D`. The `role=alert` fallback shows. Restore `getContext` afterwards.
- **Proof.** Capture `paper-3d overview`, `paper-3d click`, `paper-3d escape`, `paper-3d click-phone` (the bottom sheet at the tab's phone width, a plain screenshot), `paper-3d switch-before`, `paper-3d switch-cosmos`, `paper-3d switch-after` and `paper-3d no-webgl`.

### Gotchas

- An occluded Orca tab runs no `requestAnimationFrame`, so the layout never starts and "Loading Osra" stays. Each `orca screenshot` forces a frame: take a few to pump it, or bring Orca forward.
- The Orca tab is 879 px wide: under the 900 px drawer switch (MUI `md`, `useIsDrawerSheet`), so the desktop side drawer can't be reached, and under the 1024 px `isMobile()` cutoff, so NAV CONTROLS starts hidden. `orca set device` offers only phones taller than the pane, and their screenshots repeat the top ~540 px: prove the phone sheet with `.MuiDrawer-paper` `getBoundingClientRect()` instead. Device emulation clears on reload.
- `orca keypress Meta+f` does not reach the page; dispatch `new KeyboardEvent('keydown', { key: 'f', metaKey: true })` on `window` and say so.

## Paper 3D in colour (LIN-93 pass 93d)

### Sub-features

- `paper-3d-colour` paints the grayscale scene in the live Paper Pair with a duotone pass (`PaperEffects`, last after the depth of field and the grain): scene ink becomes the pair's ink, scene paper the pair's paper, and greys in between (parent lines, fog, label edges) land in between. With colour off it is an identity: discs, lines and labels are exactly `#1c1c1c` and the paper `236 236 234`. The scene renders untone-mapped, so far discs and lines fog fully into the paper.
- `paper-3d-fade` fades the scene with the panels: focusing a Person or closing one moves the composer's colours each frame in step with `--paper-pair-*`. INSTRUMENTS (toggle, + ADD PERSON, switch labels, VISIBILITY header and checkboxes), the search counter, and the drawer's hover states read live pair tokens, so none of them snap. The 2D empty state's own colour is `inherit`; its text reads ink tokens.
- `paper-connect-accent`: the Connect picker's selected choice in Paper is the pair's accent at 20%, not ink. Only grayscale has an accent (`#c8361d`) that differs from ink.

### Driving it with ui.sh

- **Colour.** In Paper 3D open INSTRUMENTS and click `Paper colour`. The scene turns into the overview pair. Sample the canvas pixels of a screenshot: the background equals `--paper-pair-paper` and the discs `--paper-pair-ink`.
- **Fade.** A per-frame proof needs a probe on the composer (a temporary `useFrame` at priority 2 in `PaperEffects` that reads the `paper` uniform and `gl.readPixels` a corner pixel into `window.__duoLog`; never commit it). Record `--paper-pair-paper` and the INSTRUMENTS button colour in the same rAF loop, then tap a disc. Every frame the uniform, the read-back pixel and the variable agree.
- **Fog.** Open INSTRUMENTS and click `FIND ME`: the camera flies to the owner. The nearest lines are full ink; lines and discs at the back are lighter. Mouse-wheel zoom right into the orbit target fogs everything out, because the fog scales with the distance to the target.
- **Connect accent.** Grayscale, 2D, a family picked, a Person selected: dispatch a `click` on `.handle-connect` (`🔗 Link`), then on another `.node-card` (they are SVG; see Gotchas), then click a choice. Its computed background is `color(srgb 0.784 0.212 0.114 / 0.2)`. Leave with the picker's `Cancel` (next to `Establish Link`), then `Cancel (Esc)`. Never click `Establish Link`.
- **Cosmos unchanged.** Diff a computed-style fingerprint of every element (Cosmos 2D with INSTRUMENTS open; Cosmos 3D with INSTRUMENTS and VISIBILITY open) and the drawer's `+ Add Relative` / `Invite to Tree` hover colours, between the base files and the branch, after a reload each time.
- **Proof.** Capture `paper-3d-duotone grayscale`, `colour-on-overview`, `focus-<person>`, `fog-near-far` and `paper-connect picker-accent`.

### Gotchas

- An occluded Orca window runs between 0 and about 3 rAF a second, and can stay at 0 until an `orca screenshot` pumps a frame, so a 0.4 s fade shows up as a few frames at most. To see the steps, slow the page clock for the recording (wrap `performance.now` and the rAF timestamp at 1/20 speed with `orca eval`), and say so in the report.
- In the phone sheet, the drawer's buttons sit high: a tap meant to focus the page can land on `+ Add Relative` and open its modal. Tap the heading text (`.MuiDrawer-paper h4`) instead, and Cancel any modal that opens.


## Paper 3D hover (LIN-94 pass 94a)

### Sub-features

- `paper-3d-hover` (mouse only): the Person under the pointer gets a thin ink ring, the same width at any zoom, and a pointer cursor. Their direct relatives (parents, children, spouses and ex-spouses) keep full ink; everyone else and their labels fade to half ink. Each end of a line fades with its own Person, and lines draw beneath every disc, so no line crosses a disc as a light wedge. The hovered Person's own lines darken to full ink and carry ink dots flowing out from them.
- `paper-3d-hover-lean`: the relatives lean toward the hovered Person by a small share of the distance (at most 6 world units, never into the 4-unit gap between discs) with an easing of 0.12 s time constant (most of the way in about 0.35 s), and ease back when the hover ends. Their labels, lines and arrows follow, and arrows dim with their lines; a divorce line's dashes stay even as it leans, wobbles or gathers into a search cluster. The layout itself never changes.
- `paper-3d-hover-rules`: emphasis comes from `focusEmphasis`, as in Paper 2D: while a Person is selected the selection outranks the hover, so hovering shows only the pointer cursor. Where discs overlap, a click selects the ringed Person (the nearest centre on screen), not the front-most disc. A camera drag (more than 6 px with a button down), the pointer over INSTRUMENTS or the drawer, or leaving the canvas hovers nobody. Touch has no hover: a phone tap opens the bottom sheet as before.

### Driving it with ui.sh

- Paper 3D, loaded, the tab visible, nobody selected. Pick a disc with several relatives from a screenshot (PNG pixels ÷ 2 at the 879 px tab).
- **Hover.** `$S/ui.sh "$RUN_DIR" orca mouse move --x <x> --y <y>`, wait a second, capture. Then move to empty paper and capture again: the overview is back.
- **Lean and dots.** Both move: take two captures about 0.2 s apart over the same hovered disc. The dots sit at different places along the lines; the relatives' discs are a few pixels nearer the hovered one than in the overview capture.
- **Selection outranks hover.** `ui.sh tap` a disc (the drawer opens), then hover another disc: no ring and no dimming.
- **Proof.** Capture `paper-3d-hover overview`, `hover`, `hover-off`, `hover-selected`.

### Gotchas

- `orca mouse move` sends a mouse pointer, so it hovers; `ui.sh tap` also leaves the pointer where it tapped, so a disc you just tapped stays hovered until the pointer moves.
- The dots and the lean need rAF: in an occluded tab they freeze, and a screenshot pumps only one frame.

## Paper 3D focus (LIN-94 pass 94b)

### Sub-features

- `paper-3d-focus-fly`: selecting a Person (click, search pick, FIND ME) flies the camera to them in about 1 s, from the side the camera is already on. The Person lands in the middle of the space the open drawer leaves free: left of the 400 px side drawer on desktop, above the bottom sheet below 900 px. The distance is set by their reach: the distance out to their farthest relative's disc, at least 5 disc radii, at most 150 units, so a portrait phone stands about twice as far back. A relative beyond 150 units stays off screen, and one between the Person and the camera can sit near or past the edge in perspective.
- `paper-3d-focus-emphasis`: the focused Person and their direct relatives keep full ink; everyone else is a ghost at 0.2 ink, lines fading per end as in hover. The focused Person's own lines darken and carry the hover's ink dots.
- `paper-3d-focus-ripple`: 0.4 s after the focus, as the camera nears, a 6 px ink pulse runs out along the focused Person's lines (at most 64) over 0.9 s, once.
- `paper-3d-focus-wobble`: the relatives wobble gently around their places (at most 1.5 units, easing in over 0.6 s) while the focus lasts; the layout never changes.
- `paper-3d-focus-colour`: with colour on, the panels fade from the default pair to the focused Person's family pair.
- `paper-3d-focus-tap`: each new focus plays a short Web Audio tap (880 Hz falling, 0.11 s, quiet). Any click or key press inside Paper wakes the audio first, so browsers that need a gesture still play it. It always plays: AMBIANCE is Cosmos-only (product decision 10). Nothing plays when the page loads with a Person already selected.
- `paper-3d-focus-clear`: Escape or a tap on empty paper clears the selection, closes the drawer and flies back to the overview.

### Driving it with ui.sh

- Paper 3D, loaded, the tab visible. `ui.sh tap` a disc with several relatives: the drawer opens and the camera flies. Wait 2 s, capture `focused`: the Person sits in the middle of the free space, the relatives are in view and darker than the ghosts.
- **Phone.** `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport 820 812 2"` (or 390x844): the drawer is a bottom sheet; the focused Person sits in the middle of the space above it.
- **Clear.** Press Escape, wait 2 s, capture `overview`: everyone at full ink, no drawer. Then tap again and tap empty paper: the same.
- **Tap.** Before tapping, run an eval that wraps `window.AudioContext` and counts `createOscillator().start` calls; each focus adds one and the context's `state` is `running`.
- **Colour.** With colour on, watch `--paper-pair-paper` on `document.documentElement` with a MutationObserver: it steps from the default pair to the family's pair.
- **Proof.** Capture `paper-3d-focus focused`, `phone-focused`, `escape-overview`, `background-overview`.

### Gotchas

- The flight, ripple and wobble need rAF: in an occluded tab they crawl or freeze. A tab can drop to 0 fps; close it and open a fresh one. Report motion unverified unless the tab is visible (STANDING 14).
- Consecutive screenshots under a viewport override sometimes come out half-scale in the top-left quadrant; retake.

## Paper 3D camera and effects (LIN-95 pass 95a)

### Sub-features

- `paper-3d-momentum`: a drag keeps the view gliding for a moment after release (CameraControls `draggingSmoothTime` 0.3 s) and settles without bouncing back.
- `paper-3d-idle-rotate`: 3 s after the last pointer, wheel or key input anywhere on the page, with nobody selected, the view turns slowly about the vertical axis: a point as far out as the screen edge moves about 15 px a second. It stops while a Person is selected (the camera holds still while the relatives wobble), a non-match a search hides included, and pauses on any input.
- `paper-3d-zoom`: the wheel or a pinch zooms toward the cursor, on the plane through the orbit point, so discs in front of or behind that plane drift by parallax. The camera stops 32 units from its orbit point and at 3 overview distances back, and the orbit point stays in a box 2 tree radii around the tree's centre, so a full zoom-out always brings the tree back.
- `paper-3d-effects`: on a desktop (`isMobile()` false: wider than 1024 px and no phone UA) a soft depth of field keeps the orbit point sharp and blurs discs in front and behind, with a light animated grain. Lines stay sharp, because they write no depth. On a phone there is no depth of field and the grain is lighter. The duotone runs last, so the pair still paints the final image.
- `paper-3d-reframe`: a resize or a turned phone reframes without a reload: the overview refits the tree, and a focused Person is framed again in the space the drawer leaves free (side drawer at 900 px and wider, bottom sheet below).

### Driving it with ui.sh

- Paper 3D, loaded. Set `window.__noReload = 'yes'` with `orca eval` before resizing; it must survive every step.
- **Idle turn.** No input for 3 s, then two `capture.sh` 15 s apart: discs move between them. Compare blurred greyscale crops (PIL `GaussianBlur(3)`, then count pixels changed by more than 20 levels) so the grain does not count.
- **Holds on focus.** `ui.sh tap` a disc (or FIND ME), wait 6 s, then two captures 15 s apart: no pixels change by more than 20 levels after the blur.
- **Zoom.** Dispatch wheel events on the canvas with `orca eval` (`new WheelEvent('wheel', { deltaY: ±100, clientX, clientY, bubbles: true, cancelable: true })`; one event is about one notch, 0.6× the distance). Two notches at an off-centre disc move the view toward it. Twenty more notches past either limit leave the capture unchanged. Before each capture, dispatch one tiny wheel event so the idle turn stays paused.
- **Effects.** `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport 1280 812 2"` gives a desktop: discs off the orbit point have soft edges and the empty paper has grain (pixel standard deviation about 3 against about 2 at 935 px). Say in the report that the desktop size is an override.
- **Reframe.** With the overview and again with a Person focused, `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport <w> <h> 2"` through 935x812, 820x812, 390x844 and 844x390, 5 s each: the tree refits, or the focused Person moves into the free space beside the drawer or above the sheet.
- **Proof.** Capture `paper-3d-camera idle-a`, `idle-b`, `focus-a`, `focus-b`, `zoom-toward-cursor`, `zoom-min-a/b`, `zoom-max-a/b`, `desktop-size-final`, `resize-*` and `focus-*` for each size.

### Gotchas

- `orca exec "mouse wheel …"` closes Orca's connection; use dispatched wheel events and say so.
- Under a 1280 px override the Orca pane still paints only its own width (about 935 px). The rest of the screenshot repeats the left edge, so judge the effects inside the left 935 px.
- Drag momentum and the feel of the idle turn need a visible tab at full frame rate. An unfocused Orca tab runs a few frames a second, so report motion feel unverified (STANDING 14).
- Never run an eval that awaits `requestAnimationFrame` in a throttled tab: it can hang Orca's connection. Start a counter in one eval and read it in a later one. Pump frames with one `orca screenshot` at a time: several back to back plus a long rAF eval can leave Orca refusing every page command.

## Paper 3D intro and hint (LIN-95 pass 95b)

### Sub-features

- `paper-3d-loader`: a page that opens on Paper 3D shows grey paper (`236 236 234`, even with colour on) with "OSRA" over "FAMILY TREE" in a heavy sans, each word rising 0.8 s `cubic-bezier(.16,1,.3,1)` 0.12 s after the one before, over a thin ink bar that fills as the record, the layout and the first frame arrive. It covers every control, the chat button included (z-index 10001), and is `role=status` `aria-label=Loading`. The loading screen and the scene share one loader, so the words and the bar carry on rather than start over when the scene mounts.
- `paper-3d-reveal`: once the scene is drawn and the title has risen, the words fall 0.5 s and the loader fades into the scene. The Persons grow outward from the tree's centre, nearest first, with their lines; labels come in last. Meanwhile the camera swings in from turned aside, tipped up and 1.6× further back to the overview. Both end within 1.8 s; the idle turn waits for the reveal.
- `paper-3d-crossfade`: any other arrival (COSMOS → PAPER, 2D → 3D, a page that opened elsewhere) has no title and no reveal: a paper cover with the old "Loading Osra..." spinner fades out over 0.5 s once the scene is drawn.
- `paper-3d-hint`: after the arrival settles, a pill at the bottom centre reads "Drag to rotate · Pinch to zoom" when `matchMedia('(pointer: coarse)')` matches, "Drag to rotate · Scroll to zoom" otherwise. It fades in, holds and fades out over about 4 s and writes `family-tree-paper-hint-seen` as it appears; while that key exists it never shows again. Storage that cannot be read counts as seen.
- `paper-3d-idle-modal`: the idle turn holds while any modal is open (Add Relative, Edit Registry, Bulk Invite, New Members, Manage Links, Add Person).

### Driving it with ui.sh

- Record `family-tree-paper-hint-seen` with the other keys and restore it (remove it when it was `null`).
- **Loader and reveal.** Set the view-mode key to 3D, `orca reload`, then take screenshots back to back (each takes about 1.3 s). To see the reveal frame by frame, slow the scene clock right after the reload with `orca eval` (`performance.now = () => t0 + (real() - t0) / 8`); the loader's and the hint's Web Animations keep real time. Say so in the report.
- **Hint.** Remove the key, reload, and sample `document.body.innerText.includes('Drag to rotate')` every 200 ms from an `orca eval` interval: true for about 4 s, and the key reads `1` from its first sample. Reload again: never true.
- **Cross-fade.** Open INSTRUMENTS, click `COSMOS`, then `PAPER`, while an interval samples `[role=status][aria-label=Loading]` (never present) and the opacity of the div whose inline `transition` names `opacity` (1 down to 0).
- **Phone.** `$S/ui.sh "$RUN_DIR" orca reload`, then at once `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport 390 844 2"` (a reload clears it) and take screenshots: the title wraps the same, the hint sits beside the chat button.
- **Proof.** Capture `paper-intro load-*`, `slow-*`, `hint-*`, `reload-noh-*`, `switch-paper2-*` and `phone-*`.

### Gotchas

- A throttled tab (Orca not in front) runs between 0 and about 3 frames a second, so the reveal and swing need screenshots to pump frames or the slowed clock above; report the feel as unverified unless the tab is visible.
- **Exact pace without a visible tab.** Patch `performance.now` to a virtual clock with `orca eval`, then drive frames with R3F's `advance()` from a 16 ms `setInterval`, so each frame is exactly 1/60 s. To count flights, wrap the CameraControls methods (`fitToSphere`, `setLookAt`) in the same eval and log each call. This gives the pace and the flight count; the feel still needs a visible tab (STANDING 14).
- A tab can stall at 0 frames: close it and open a fresh one with `open-tab.sh` (delete `state/page` first).
- Viewport emulation has no touch, so the live hint reads "Scroll to zoom" even at phone size; the pinch copy is covered by `src/lib/paperIntro.test.ts`.

## Paper 3D editing (LIN-96 passes 96a to 96c)

### Sub-features

- `paper-3d-add-person`: INSTRUMENTS → `+ ADD PERSON` opens the same form as Cosmos, in paper and ink. A Person added during the session (from any path) gets a disc beside their relatives, or at the edge of the cloud with none, and nobody else moves; the full layout is recomputed on the next load. A newcomer who leaves the Working Record again (an aborted Spawn) is dropped.
- `paper-3d-handles` (desktop, 1025 px and wider): selecting a Person docks the Action Handles panel at the left, as in Cosmos: `+ Parent`, `+ Child`, `+ Spouse` in ink, `🔗 Connect` and `✕ Dissolve` in the pair's accent, with a dashed leader line and a ring on the disc. Phones keep the drawer path: no handles (ADR 0002, LIN-62 amendment).
- `paper-3d-ghost`: a handle opens the Ghost Node card and the Ghost Preview in ink: a sphere with a wireframe shell at the newcomer's disc size, a dashed tether to the Person and an ink label. It sits exactly where the newcomer will land: beside the Person for `+ Parent` and `+ Spouse`, and beside whichever parent `placeNewcomer` picks for `+ Child` (with a spouse that can be the other parent, off to the side of the card). When the card offers a choice of other parent (two or more spouses), the preview lands with the card's pick and moves when the pick changes (LIN-127); Cosmos keeps its fixed offset whatever the pick. ✕ or Escape closes it.
- `paper-3d-lifecycles`: Spawn and Dissolve are drawn in ink on the shared lifecycle progress (no glow, no colour). A Spawn grows the newcomer's disc from a dot of no ink, a little past its size and back, with a thin ink ring going out; each new line grows from the Person already there to the newcomer (a marriage line for `+ Spouse`; for a child only the one parent line Paper draws, ADR 0012); Connect Mode's link grows from one end. Each line grows in its own style (a divorce line dashed). A Dissolve shrinks the disc as it fades into the paper, with ink specks blown off it, at the Person's last place even after the Working Record has dropped them; the admin link manager's link Dissolve draws the removed line back to nothing in its own style. The name fades with its disc. Nothing plays for a Person the view hides (a collapsed branch, a cluster filter), and a Spawn or Dissolve stops drawing if the view hides them partway through. A failed write unwinds the same drawing.
- `paper-3d-connect-preview`: in AddRelativeModal (drawer `+ Add Relative`), focusing a connect-to-existing match draws a dashed ink line from the selected Person to that match while both are shown.
- `paper-3d-connect`: the drawer's `Connect Nodes...` (desktop and phone) or the panel's `🔗 Connect` enters Connect Mode: the panel shows "Connect <name> to…" and "Click a person, or pick from the list." (Cosmos: "Click a glowing planet…") (on a phone the sheet hides first), the Person stays focused, the candidates keep full ink and everyone else, their relatives included, is ghosted at 0.2 ink. Clicking a candidate disc opens the kinship picker and keeps that disc marked; `Establish Link` writes through the same handler as Cosmos. `Cancel (Esc)` or Escape leaves it. On a phone the panel docks at the bottom with only the ring on the disc.
- The panel, the Ghost Node card and the Connect picker read the live pair's tokens only in Paper; Cosmos keeps its colours.
- The host sets the look (LIN-125): `FamilyTree3D` passes Cosmos and `PaperTree3D` Paper to the panel, which hands it to the Connect targeting body and picker; `FamilyTree2D` passes its Canvas Mode to the 2D picker. So the Connect copy, the picker's selected-choice tint and the `Establish Link` ink follow the scene, in 2D and 3D.

### Driving it with ui.sh

- Desktop size needs the override `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport 1280 812 2"` after each reload; the Orca pane is about 935 px, so the right part of the PNG repeats.
- **Handles and ghost.** Paper 3D, INSTRUMENTS → `FIND ME`: the panel shows. `ui.sh click button "+ Child"`, fill the card's name with `Zz Lin96 Preview` and close it with ✕. Never press Enter or Add: that writes.
- **Connect.** With a Person selected, `ui.sh click button "Connect Nodes..."` (on a phone the sheet hides it below the fold: `orca scrollintoview` its ref first). `ui.sh tree` shows "Connect <name> to…" and `Cancel (Esc)`. Tap a candidate disc: the picker opens; `Cancel` returns to targeting, Escape leaves.
- **Phone.** `set viewport 820 812 2`: `FIND ME` selects with no handles; `Connect Nodes...` from the sheet opens the bottom-docked panel.
- The writes (Enter in the Ghost Node card, `+ ADD PERSON` submit, `Establish Link`) are **Owner** steps; see [add relative](./add-relative.md).
- **Ghost landing.** With the card open, an `orca eval` that `await import('/src/lib/paperGhost.ts')` can compare `paperGhostLanding(layout, graph, anchorId, relation, otherParentId)` (the card's other-parent pick, `null` for "Not known" or a non-child relation) with the `ghost-preview` object's position in the scene, if a temporary probe exposes the layout and the graph handle on `window` (never commit it). The two are equal and the body's radius is the landing's.
- **Connect copy.** In Paper 3D, `ui.sh tree` shows "Click a person, or pick from the list."; switch to COSMOS with the Person still selected and press `🔗 Connect` again: "Click a glowing planet, or pick from the list." To leave with Escape, first tap the drawer heading (`.MuiDrawer-paper h4`) so the page has focus; ui.sh refuses keys otherwise.
- **Connect preview.** Drawer `+ Add Relative`, type a shown Person's given name with `ui.sh fill` (no Enter), and click the match row under MATCHES DETECTED IN ARCHIVE. That only selects it; the primary turns "Connect to tree", which you never click. The modal docks right and a dashed ink line runs from the selected Person to the match. The overlay keeps `backdrop-filter: blur(8px)` in every view, so the scene is blurred: to photograph the line, set the fixed overlay's `style.backdropFilter = 'none'` with `orca eval`, restore it, and say so. Cancel with a DOM click on the modal's own Cancel button (ui.sh's click can miss it in the scrolled panel).
- **Ripple.** A temporary probe in `PaperRipple` that uses `window.__rippleAt` as the progress and writes `segments.visible` and `segments.material.visible` to `window` proves the pulse draws: at 0.5 a thick ink segment sits midway along each of the focused Person's lines.
- **Spawn and Dissolve.** They play only on a write, so the live proof is the Owner walk in [add relative](./add-relative.md) (Enter in the Ghost Node card, then Delete Entry on the test Person). Without writes, a temporary probe in `PaperTree3D` that swaps `lifecycles.lifecycles` and `lifecycles.progressOf` for a fixed list (keys `<kind>:<subject json>`) and a constant progress, read from `window` on a short interval into state, shows the frames. Useful values: Spawn 0.25 (disc grey and small, line half drawn), Spawn 0.5 (line whole, ring clearly outside the disc), Dissolve 0.25 (shrunken disc with specks); below about 0.35 the ring is behind the disc. Expose `paperLifecycleDraws`' result on `window` to prove a hidden Person draws nothing (`[]`). Never pass `visible` to a drei `Line` in a probe. An Orca tab that is not on screen runs between 0 and about 3 fps, too slow to time the motion; use the stepped virtual clock under **Exact pace without a visible tab**.
- **Proof.** Capture `paper-add-person`, `paper-handles`, `paper-ghost`, `paper-connect`, `paper-connect-escaped`, `paper-connect-pick`, `phone-selected` and `phone-connect`.

### Gotchas

- Fingerprinting Cosmos for no change: open VISIBILITY and wait about 6 s before capturing; at 3 s its body can still be animating and differ by one element. Park the mouse first (`$S/ui.sh "$RUN_DIR" orca mouse move --x 3 --y 700`). In Connect Mode the candidate list (names per slot follow what is in view), the leader ring's `circle` cx/cy and the canvas cursor always differ: compare those elements' property sets, not hashes. Any SVG element that tracks a node's sub-pixel screen position can differ the same way: re-capture its full computed style on both sides before calling it a diff. Build the base in the same browser session by swapping in the base source for a moment; a base stored from another session carries different Vite `<style>` tags and app state. Filter out the `--paper-pair-*` variables, which every element inherits from `<html>`.
- At the 1280 px override with no drawer open, INSTRUMENTS and NAV CONTROLS sit beyond the ~935 px the Orca pane paints, so screenshots miss them although the DOM has them open; check the button texts (`INSTRUMENTS ▴`, `VISIBILITY ▴`) instead.
- In Cosmos 3D, FIND ME just after a reload can do nothing; retry until `.MuiDrawer-paper h4` appears.

## Paper 3D navigation and collapse (LIN-96 pass 96d)

### Sub-features

- `paper-3d-nav-keys` (desktop; NAV CONTROLS is hidden on phones): NAV CONTROLS lists `WASD: Move (Hold Shift for Boost)`, `Q / E: Rotate View L / R`, `R: Reset View`, `Tab: Cycle Names`, `Enter: Focus selection`, `Esc: Deselect`. Holding W/S moves the camera and its orbit point forward and back, A/D slide them sideways (the arrow keys too), at 0.8 view distances a second, four times that with Shift. Q/E turn the view about the orbit point. R does what RESET VIEWPORT does: it steps back out of the selection and flies to the overview. Tab and Shift+Tab select the next or previous shown Person (the camera flies there) and Enter flies to the selected Person again, but only while no control has focus: after a click on a button, Tab and Enter work that button until the scene is clicked. Esc deselects, with or without modifiers. Keys do nothing while a text field has focus, while a Ctrl, Cmd or Alt combination is held, or before the intro has settled: WASD and Q/E do not fly during the loader, the reveal or the crossfade. In Connect Mode Tab does nothing and keeps its usual browser effect. Behind any modal R, Tab, Enter and Esc do nothing; WASD and Q/E still fly behind the Add Relative preview, as in Cosmos, and behind no other modal. A held key is tracked by its physical key and let go when Cmd, Alt or Ctrl goes down.
- `paper-3d-collapse`: INSTRUMENTS → `COLLAPSE ALL` hides every parent's descendants and turns into `EXPAND ALL`; a double-click on a parent's disc selects them and hides or shows their branch. A double-click on a parent who is already selected keeps them selected: a single click on the selected Person deselects them only after 0.5 s, once no second click came. The collapse goes to the Person under the first click, even when selecting them flew their disc out from under the pointer. In Connect Mode a double-click collapses nothing. The collapsed Person stays, and nobody shown moves, since the layout is fixed.
- `paper-3d-toggles`: `LABELS`, `LINKS` and `ARROWS` hide or show the names, the lines (with their particles and ripple) and the arrowheads. With `LINKS` off and `ARROWS` on, the parent lines stay, with their arrows, as in Cosmos; marriages and divorces go.
- `paper-3d-findme`: `FIND ME` selects the signed-in Person and flies to them.
- `paper-3d-whos-new`: `See who's new!` sits above NAV CONTROLS when there are new members and opens the same "New family members" modal as Cosmos, in Paper colours.

### Driving it with ui.sh

- Desktop size: `$S/ui.sh "$RUN_DIR" orca exec --command "set viewport 1280 812 2"` after each reload. Keep the tab in front.
- **Camera state.** CameraControls is not reachable from the page. A temporary probe in `PaperTree3D` (never commit it), `useEffect(() => { Object.assign(window, { __paperControls: controlsRef, __paperShown: shownIds, __paperLayout: layout, __paperCollapsed: collapsedNodes }); });`, lets `orca eval` read `getPosition`, `getTarget`, `azimuthAngle` and `distance`.
- **Keys.** `$S/ui.sh "$RUN_DIR" orca exec --command "keydown w"`, wait about a second, then `"keyup w"`: position and target move together and the distance holds. `"press r"`, `"press Tab"`, `"press Shift+Tab"`, `"press Enter"`, `"press Escape"` for the rest; read `.MuiDrawer-paper h4` for the selection.
- **Collapse.** Open INSTRUMENTS, click `COLLAPSE ALL`, then `EXPAND ALL`; read `__paperShown.length`. For a double-click, project a parent's layout position to the screen with the camera (`new THREE.Vector3(...).project(camera)` from the probe), `orca mouse move` there, then `orca mouse down` / `up` twice: Chromium fires a real `dblclick`.
- **Probe without a code edit.** A page eval can import R3F's `_roots` from `/node_modules/.vite/deps/@react-three_fiber.js?v=<hash>` (the same module instance the app uses; copy the hash from a loaded script URL) to reach the scene, the camera and CameraControls, and read PaperTree3D's props and hooks from its React fiber for `shown`, `layout`, `arrival` and the selection. The intro has no storage key: it plays on the page's first Paper 3D load, so reload to see it again. A `keydown` sent while the tab draws no frames can be dropped; send keys while a screenshot pumps frames.
- **Toggles.** With INSTRUMENTS open, click each switch's input and capture a crop around a focused Person.
- **See who's new.** The button shows only when a node is newer than `osra_tree_lastAck_<user id>` in localStorage. Record that key, set it to an earlier date, reload, click the button, close the modal, then put the key back.
- **Proof.** Capture `paper-3d-collapse before-collapse-all`, `after-collapse-all`, `after-expand-all`, `dblclick-collapsed`, `dblclick-expanded`, `paper-3d-toggles *`, `paper-3d-findme after` and `paper-3d-whos-new modal-settled`.

### Gotchas

- agent-browser's `keydown Shift` reports `shiftKey: false` on the events that follow, so the boost follows the Shift key's own down and up, as in Cosmos.
- An Orca tab that is not on screen draws between 0 and about 3 frames a second, and each frame's move is capped at 0.1 s, so a held key covers less ground than at full rate. Count frames with a `requestAnimationFrame` counter and compare moves per frame, or report the feel unverified.
- `ui.sh fill` can leave focus on a button. Focus the field with `orca eval` before testing that keys do nothing while typing.
- A MUI dialog captured right after it opens in a throttled tab is mid-fade and looks see-through; capture again after a few seconds.

## Paper search (LIN-97)

### Sub-features

- `paper-3d-search-cluster`: typing in SEARCH ARCHIVE shrinks every non-match to nothing (about 0.8 s) and moves the matches, with only the lines between them, into a compact cluster around their centre (about 3 s, eased in and out). The camera frames the cluster with room for names. Another query moves the scene from wherever it is drawn. A selected match keeps the camera on them; a selected non-match keeps their selection, but the camera frames the cluster, and so do FIND ME, Enter and a resize for them. A search already typed when Paper 3D opens frames the cluster too. A Spawn or Dissolve of a match during a search moves no other match: a newcomer settles at the cluster's edge and a dissolved match drops out. Hover and clicks reach only matches. Tab cycles the matches. R and RESET VIEWPORT deselect and frame the cluster, not the whole tree. A `+` handle on a selected match puts the Ghost Preview beside that disc in the cluster, at the same offset as outside a search. In Connect Mode the query belongs to the picker and the scene does not gather.
- `paper-3d-search-clear`: emptying the box (Escape in the box, or deleting the text) moves everyone back to their fixed place and grows the non-matches back; the camera flies to the overview, or to the selected Person.
- `paper-3d-search-shortcut`: Ctrl+F (Cmd+F on a Mac) opens INSTRUMENTS and focuses the search box, as in Cosmos.
- `paper-search-count` (2D and 3D): while the box holds text, a count sits under the `current/total` counter: `1 PERSON`, otherwise `N PEOPLE` (`0 PEOPLE` with no match). Cosmos shows no count.
- `paper-3d-search-step`: Prev/Next, and Enter / Shift+Enter in the box, select the next or previous match in the order the search found them, wrapping round, and the camera flies to each as on any focus (the drawer opens). The counter shows the selected match (`0/N` before the first step or with a non-match selected).
- `paper-search-escape` (2D and 3D): with a Person selected, Escape (in the box or not) deselects and keeps the search; in 3D the camera frames the cluster again. The next Escape clears the search and restores the fixed layout.
- `paper-2d-search`: non-matches dim to `0.12` and no card moves; Prev/Next pan to each match as in Cosmos.

### Driving it with ui.sh

- Paper 3D at desktop size (`set viewport 1280 812 2`), tab in front, intro settled. Phone: `set viewport 820 812 2`.
- **Shortcut.** Tap empty space at the bottom (`ui.sh tap 640 790`), then `ui.sh key Control+f`: INSTRUMENTS reads `▴` and `document.activeElement` is the `Search family tree` box.
- **Cluster.** `ui.sh fill textbox "Search family tree" "Zabalawi"`, wait 4.5 s, capture: only the matches and their lines remain, framed.
- **Clear.** Focus the box with `orca eval`, `ui.sh key Escape`, wait 4.5 s, capture: the full tree.
- **Exact restore.** A page eval that imports R3F's `_roots` (see [navigation](#paper-3d-navigation-and-collapse-lin-96-pass-96d)) finds the scene's instanced mesh with more than 100 instances and reads each instance's translation and scale with `getMatrixAt`. Record it after a reload, after the search settles and after the clear: during the search only the matches have a scale above 0 and each has moved; after the clear every translation and scale equals the first record. After a reload, wait until `_roots.size` is 1 before the first read; under load the root can mount more than 11 s after the reload.
- **Count and stepping.** After the cluster settles, the count reads `32 PEOPLE` for Badran/"Zabalawi" in 3D (`8 PEOPLE` in Paper 2D with Badran picked). `click button "Next match"` opens the drawer on a match and the counter reads `1/32`; Previous from `1/32` wraps to `32/32`. Read the camera target from R3F's store (`controls.getTarget`): it moves to each match. A full name such as "Abdulrazzaq" gives `1 PERSON`.
- **Escape order.** Select a match with Next, blur the box (`document.activeElement.blur()`), Escape: the drawer closes, the query stays and the camera target returns to the cluster centre. Escape again: the box empties and the disc record equals the first one.
- **Re-framing.** With no selection, move the camera away (`controls.setLookAt` as setup), then `set viewport 1100 812 2`: the target returns to the cluster centre. Select a match, then type a query that keeps them ("Abdulfattah"): the target stays on that disc. Select a non-match (a Badran), then type "Zabalawi": the drawer keeps them and the target is the cluster centre.
- **Proof.** Capture `paper-search fixed`, `ctrl-f-open`, `settled`, `cleared`, `phone-settled`, `phone-cleared`, `3d-count`, `3d-esc1-deselected`, `3d-selected-match-new-query`, `3d-selected-nonmatch`, `3d-phone-1-person` and `2d-dim-count`.

### Gotchas

- `ui.sh key Meta+f` never reaches the page in Orca's browser (a `keydown` listener records nothing); drive the shortcut with `Control+f`. The handler is the shared one in `FamilyTree.tsx`.
- With INSTRUMENTS open, its panel covers the right of the scene, and on a phone part of the cluster sits under it.
- A computed-style fingerprint taken a few seconds after typing in Cosmos 3D can catch the Prev/Next buttons mid-transition; capture again once settled before calling it a diff.
- When Orca's window is not the front app, `document.hasFocus()` is false and `ui.sh key` refuses; `orca keypress` then reaches nothing. Dispatch `new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })` on the focused box (or on `window` for outside it) and say so.
- In a throttled tab the 2D cards' 0.15 s opacity transition does not advance until a frame is drawn: take two or three `orca screenshot`s before reading `opacity`.
- A 2D match can sit off-screen, where `ui.sh person` misses it; dispatch a `click` on its `.node-card` and say so.
- The MUI ripple under COLLAPSE ALL mounts on the first mouseleave, so a fingerprint can differ by one `span` with the pointer's history; capture base and branch with the same steps in the same order.

## Paper 3D Spread (LIN-129)

### Sub-features

- `paper-3d-spread`: INSTRUMENTS in Paper 3D shows SPREAD, a small slider under LABELS / LINKS / ARROWS, on desktop and phone; Cosmos shows none. It runs continuously from 1x (left, today's layout, where it starts on each load) to 3x. Dragging it moves every shown Person straight out from the tree's centre by that factor, with their lines and names; discs and names keep their size, so links lengthen and the tree keeps its shape. The camera holds still while dragging, except with a Person selected: it moves with them, so they stay put on screen while their relatives move away. The zoom-out limit and the orbit box grow with the Spread, so a full zoom-out, RESET VIEWPORT and R frame the whole spread tree. Hover, clicks, search, Connect Mode, Ghost Previews, the editing panel's rings and a newly added Person all sit at the spread places; adding a Person at 3x moves nobody else. The value survives Paper → Cosmos or 2D → Paper and is back at 1x after a reload; nothing is saved to `localStorage` or Supabase.

### Driving it with ui.sh

- Paper 3D at desktop size (`set viewport 1280 812 2`), tab in front, intro settled; open INSTRUMENTS. The slider's input is `input[aria-label="Spread"]`; its `aria-valuetext` reads the value (`1.0x`).
- **Move it.** `ui.sh tap` the right end of the slider's rail (MUI jumps the thumb to a rail tap) for 3x, the middle for 2x; for a drag, dispatch `pointerdown` on the thumb and a run of `pointermove`s along the rail with `orca eval`, and say so.
- **Spread, not zoom.** Record every disc's translation and scale from the instanced mesh (`getMatrixAt`, via R3F's `_roots`, see [search](#paper-search-lin-97)) at 1x and at 3x: each translation at 3x is the 1x one moved out from the same centre by 3, and every scale is unchanged. At 1x after the move back, the record equals the first one exactly.
- **No re-render per tick.** The slider is uncontrolled and its `onChange` writes only the Spread ref the scene reads each frame (`PaperSpreadSlider.tsx`, `PaperSpreadRig.tsx`). A live check needs a React commit counter: when `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` exists, wrap its `onCommitFiberRoot` with `orca eval`, drag, and expect commits only from the slider's own root updates, none per tick in the Canvas root (R3F's `_roots`). Without the hook, report it as checked in the code.
- **Camera.** Read `controls.getTarget` and `getPosition` from R3F's store before and after a move with nobody selected: unchanged. Select a Person, move the slider, read again: target and position moved by the same vector, and the Person's disc projects to the same screen point. Repeat with a jump: at 3x, tap the rail's left end (1x); the Person still projects to the same point. With nobody selected, pan far out at 3x, then tap the left end: the target is unchanged.
- **Limits.** At 3x, twenty wheel notches out then a capture: the whole tree is on screen. R and RESET VIEWPORT frame it whole too.
- **Survives a switch.** Set 2x, switch to Cosmos and back (Canvas Mode switch) and to 2D and back: the slider reads `2.0x` and the record matches the 2x one. Reload: `1.0x`. `Object.keys(localStorage)` holds no new key.
- **Proof.** Capture `paper-3d-spread 1x`, `3x`, `3x-selected`, `3x-zoomed-out`, `after-switch`, `after-reload`, `phone-instruments` and `cosmos-instruments`.

### Gotchas

- The INSTRUMENTS panel opens to at most 800 px high and clips what is below; with SPREAD added, check the last items (VISIBILITY) still show on a short viewport.
- A selected Person behind a flight still in progress moves the flight's end with them; let the focus flight settle before reading the camera for the follow check.
- The fog follows the camera's distance, so at 3x with the camera still, far Persons fade into the paper until you zoom out.
