# 0002 3D Spatial Direct Manipulation

We decided to extend in-tree direct manipulation (ADR 0001) into the 3D view (`FamilyTree3D`) using a screen-space DOM overlay, a frozen scene during inline actions, and selection-only affordance reveal — deliberately diverging from the 2D interaction model where the third dimension and the live force simulation make a direct port wrong.

## Context & Decision

- **DOM overlay, not in-scene chrome**: Action Handles, Ghost Nodes and the kinship picker render as absolutely-positioned HTML positioned from `graph2ScreenCoords`, not as `three-spritetext` sprites or `CSS3DRenderer` objects. Sprites give correct depth occlusion but make real text input, focus management and autocomplete impractical, and would require a second hit-testing system alongside the graph's own raycaster. We accept the loss of depth occlusion (chrome floats over nearer planets) as a cosmetic cost, mitigated by scale-by-distance and drop shadows. This also lets the 2D card bodies be reused directly — they are already plain DOM inside a `<foreignObject>`.

- **Manipulation Freeze**: Entering any inline action suspends both the force simulation and camera motion until the action commits or cancels. ADR 0001 promises "zero layout jitter while typing", which the 2D static layout gives for free; 3D nodes drift continuously, so without a freeze the overlay chases its anchor across the screen. Pinning only the anchor node was rejected — neighbours reflowing around it still shifts the visual field under a floating input.

- **Camera-relative direction**: "Up = Parent" is resolved against the camera basis at the moment the handles open, then held. A world-axis convention was rejected because the force layout has no genealogical axis, so world-up handles would render behind the planet from roughly half of all viewpoints. `CONTEXT.md`'s definition of **Action Handle** was amended from "Top/Bottom/Side" to screen-relative phrasing to cover both views.

- **Selection-only reveal (divergence from ADR 0001)**: 2D reveals Action Handles on hover *or* selection. 3D reveals them on selection only. This is not merely a cost decision about per-mousemove raycasting: planets overlap in depth, so hover-reveal would flicker the handle set between occluded candidates as the pointer moves. Selection is unambiguous and composes with Manipulation Freeze — select, camera settles, handles appear on a stationary target.

- **Connect Mode targeting**: `onNodeClick`'s camera fly-to is gated off while targeting, so a candidate click resolves the target instead of launching the camera. Valid candidates are rim-lit and non-candidates dimmed, with the search result set usable as a fallback target picker — pure raycasting is insufficient in 3D because legitimate targets can be occluded or off-screen with no way for the user to tell bad aim from an invalid target.

- **Animation lifecycles are shared, renderings are not**: Supernova and black-hole collapse are the 3D renderings of **Spawn** and **Dissolve**, not new lifecycles — same triggers, same optimistic-update and rollback semantics. The 2D `SpawnBurst` / `ParticleDissolve` SVG particle systems are not portable and are reimplemented in Three.js. Link-growth pulses reuse the graph's built-in `linkDirectionalParticles`; hand-written effects are capped and disabled under `isMobile()`, alongside the existing geometry and material reductions.

- **Desktop-only for v1**: Touch has no hover model and two-click targeting fights pinch-zoom. Mobile 3D retains the existing `PersonDetailDrawer` path, which is already a complete route to every action. Recorded as a known gap, not an omission.
