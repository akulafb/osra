# 0014 Paper renders its own 3D scene beside Cosmos

Paper 3D is its own React Three Fiber scene, `PaperTree3D`, mounted as a sibling of the Cosmos view (`FamilyTree3D`): in 3D, `FamilyTree.tsx` renders one or the other by Canvas Mode. The overlay chrome both modes share (INSTRUMENTS, AMBIANCE, NAV CONTROLS, the "See who's new" slot, and the search-open reaction to Ctrl/Cmd+F) moves out of `FamilyTree3D.tsx` once, as a move-only change, into a shared overlay component that both scenes render. Cosmos keeps its force graph, physics, starfield, intro, cluster bubbles, Cosmic FX, flight loop and keyboard exactly as they are.

Paper does not restyle Cosmos. Its Persons sit still in a seeded layout (`src/lib/paperLayout.ts`) computed once per load, where Cosmos runs live d3 physics. Its colour comes from a duotone pass over a grayscale scene, where Cosmos draws per-node textures, fog and a starfield. Its camera is drei's CameraControls, with momentum and idle rotation, where Cosmos drives the force graph's own controls with hand-written lerps. Making the force graph do all of that would mean switching off most of what it is for, and Cosmos would carry Paper's branches.

## Considered Options

- **Swap only the force-graph element inside `FamilyTree3D`**, gating the Cosmos-only hooks off in Paper. Rejected: by our estimate about 900 lines of that 2,136-line file assume the force graph (`fgRef` alone appears 35 times), so Cosmos would gain roughly 30 `isPaper` branches. Several would fail quietly. The "Loading Osra" overlay clears only on the force graph's `onEngineStop`, so it would never clear. The starfield toast would stick. Cosmic FX has no enable flag and idles only while `fgRef` is empty. Any adapter that fills `fgRef` for Paper would wake it and get the starfield, fog and cluster bubbles injected into Paper's scene. Every later Paper ticket would edit the Cosmos file.
- **Duplicate the overlays into the Paper scene**: no change to Cosmos, but two copies of INSTRUMENTS drift apart, and Paper's panel colours, search and controls would be built twice.

## Consequences

- **Cosmos.** `FamilyTree3D.tsx` changes once, in LIN-93: its overlay JSX is replaced by the shared overlay, with Cosmos-only controls (TEXTURE, FAMILY PRESETS) passed in a slot that Paper leaves empty. Product decision 5 hides those two controls in Paper. The extraction is proven unchanged with a computed-style fingerprint of the Cosmos page before and after. No later Paper ticket edits `FamilyTree3D.tsx`.
- **Not in the shared overlay.** `Manipulation3DPanel` stays mounted by each scene, because it needs that scene's handle and live positions. The keyboard stays in each scene too: Cosmos's handler is bound to its flight loop and `handleNodeClick`, and Paper's keys drive its own camera (product decision 6).
- **The shared overlay is controlled.** It owns only panel UI state (open, menus). Each scene keeps its own AMBIANCE flag, its LABELS / LINKS / ARROWS toggles, and its camera. The overlay reaches the camera through a two-call scene interface, focus a Person and reset the view, for FIND ME and RESET VIEWPORT. Search Prev/Next stays in each scene.
- **Positions.** Paper reads positions only from its layout map and never writes `x/y/z` or `fx/fy/fz` onto `FamilyNode` objects. Those objects are shared with Cosmos, and d3 mutates them (ADR 0006). Where shared code reads `x/y/z` from a node array (`Manipulation3DPanel`, `useGhostPreview`, `useTargetVisibility`), Paper passes new `{ id, x, y, z }` objects built from the layout. The layout covers the whole Working Record: collapse and VISIBILITY only stop drawing a Person. A Person added during the session is placed with `placeNewcomer`, and nobody else moves; their relatives keep their disc size until the next load, when the full layout is recomputed. `usePaperLayout` is called from `FamilyTree.tsx`, which stays mounted, so the layout survives a switch to Cosmos or 2D and back.
- **Lines.** Paper draws with `paperLines`, the drawn-parent rule Cosmos uses, over the Persons shown (ADR 0012).
- **Disc size** grows with the Person's stored Kinship Link count, both parent links included. Counting only drawn lines would make a mother smaller than the father of the same children whenever the father's line is the one drawn.
- **Switching modes** unmounts the other scene. Coming back to Cosmos replays its warm-up and intro, as it already does after a trip to 2D.
- **Loading.** Paper has its own loaded gate, set when the layout is done and the first frame is drawn. Every camera duration is finite (ADR 0011).
- **The LIN-91 stopgap goes.** Under it, Paper in 3D showed the Cosmos scene in Paper panels.

## Write set for LIN-93 to LIN-97

`src/components/paper/` holds the Paper scene, one component per concern: discs, lines, labels, duotone, camera rig, effects.

- **LIN-93, pass 1 (landed).** `src/lib/paperLayout.ts` (`layoutPaperTree`, `placeNewcomer`, `paperLines`, `kinshipLinkCounts`, `paperDiscRadius`) with its tests, `src/lib/seededRandom.ts`, this ADR, and the `@react-three/postprocessing` v2 dependency.
- **LIN-93, pass 2.** First, as its own commit, the extraction: the new `src/components/tree3d/Tree3DOverlay.tsx`, the new `src/components/tree3d/useIsMobileDevice.ts` (the resize-tracked `isMobile()` both scenes use) and `FamilyTree3D.tsx`. Then the scene:
  - `FamilyTree.tsx` (choose the scene by Canvas Mode);
  - `src/hooks/usePaperLayout.ts`, which computes the layout once and keeps it across mode switches;
  - `src/components/paper/PaperTree3D.tsx`, `PaperDiscs.tsx`, `PaperLines.tsx`, `PaperLabels.tsx` and `PaperDuotone.tsx`, plus the WebGL fallback;
  - Escape in Paper 3D, through `interaction.handleEscape()` as in Cosmos;
  - `vite.config.ts` (the `vendor-three` chunk);
  - the bundled label font;
  - `features/paper-mode.md` and `features/tree-views.md`.
- **LIN-93, passes 3 and 4 (duotone, live pair, review fixes).**
  - `src/components/paper/*`: the duotone pass and its pure colour map;
  - `src/theme/panel.ts`: the live pair tokens the panels below read;
  - `TreeSearchBar.tsx` (the counter), `FamilyTree2D.tsx` (the empty state), `PersonDetailDrawer.tsx` (the hover states, and Connect Nodes offered only when a handler is passed) and `ConnectPickerCard.tsx` (the selected choice in the pair's accent);
  - `Tree3DOverlay.tsx`: optional AMBIANCE and previous/next match props. Paper 3D passes neither, so it hides AMBIANCE (Cosmos-only: the Paper focus tap from LIN-94 always plays, product decision 10) and the match stepping (LIN-97), lists only Esc under NAV CONTROLS (LIN-96 adds WASD, Q/E and R) and offers no Connect Nodes (LIN-96).
- **LIN-94.**
  - `src/components/paper/*`: hover, focus, fly-to, screen-space hit testing, ring, particles, ripple, wobble;
  - new pure `src/lib/paperHover.ts` and `src/lib/paperFocus.ts` with tests: hit testing, the lean, the fly-to framing, the ripple and the wobble;
  - `src/lib/paperPairs.ts` and `src/contexts/CanvasModeProvider.tsx`: the pair a focus fades to, moved into `paperTargetPair` (move-only);
  - a new tap-sound module generated with Web Audio (product decision 8);
  - `features/paper-mode.md`.

  It uses `focusEmphasis` and does not change it.
- **LIN-95.**
  - `src/components/paper/*`: camera rig momentum, idle rotation, zoom bounds, intro loader and reveal, depth of field and grain, resize. The composer runs depth of field, then grain, then the duotone, so the live pair paints the final image. Lines write no depth, so the depth of field leaves the empty paper's depth sharp rather than blurring the lines away;
  - new pure `src/lib/paperCamera.ts` and `src/lib/paperEffects.ts` with tests: the idle gate and turn speed, the zoom limits and the orbit box, and the effects for a phone or a desktop;
  - new pure `src/lib/paperIntro.ts` with tests: each Person's reveal share and progress by distance from the centre, the hint copy for a coarse or fine pointer, and the hint's seen key `family-tree-paper-hint-seen`;
  - the intro plays once a page session, and only when the page opens on Paper 3D: `FamilyTree.tsx`'s Paper 3D loading branch starts the title, and the first Paper scene takes the same loader over (`paperIntroSession.ts`). Any later mount, after a COSMOS ⇄ PAPER or 2D/3D switch, fades in from paper (product decision 7). The reveal and the camera swing run on R3F's clock and end within 1.8 s (ADR 0011); the idle turn holds during the reveal and behind any modal (`isModalOpen` on `PaperTree3D`);
  - a new hint component and its storage key;
  - `features/paper-mode.md`.
- **LIN-96.**
  - `src/components/paper/*`: an adapter that satisfies `ForceGraphHandle` from R3F state for `Manipulation3DPanel`, Ghost Previews and target visibility; Spawn and Dissolve in ink; the WASD / Q/E / R keyboard (product decision 6) and Tab / Enter; double-click collapse;
  - `src/hooks/usePaperLayout.ts` (call `placeNewcomer` for new Persons);
  - `features/paper-mode.md` and `features/add-relative.md`.

  `Manipulation3DPanel.tsx`, `useGhostPreview.ts` and `useTargetVisibility.ts` are reused unchanged.
- **LIN-97.**
  - a new pure `src/lib/paperSearchCluster.ts` with tests: the one-off settle of the matches;
  - `src/components/paper/*`: hiding the non-matches, the cluster's lines, framing;
  - `TreeSearchBar.tsx`: an optional count label that Paper 2D and Paper 3D pass and Cosmos does not;
  - `FamilyTree2D.tsx` only for passing that label, since Paper 2D's search emphasis already comes from `focusEmphasis` (ticket 2);
  - Escape order in Paper (product decision 9): the selected Person first, then the search;
  - `features/paper-mode.md` and `features/tree-search.md`.

  Ctrl/Cmd+F already works through the shared overlay.
- If LIN-94 to LIN-97 need anything new from the shared overlay, it is an optional prop, and Cosmos does not pass it.
