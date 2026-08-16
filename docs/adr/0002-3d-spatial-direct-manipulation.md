# 0002 3D Spatial Direct Manipulation

We decided to extend in-tree direct manipulation (ADR 0001) into the 3D view (`FamilyTree3D`) using a **docked panel for every interaction plus a non-interactive spatial preview in the scene** — deliberately diverging from the 2D interaction model, where the third dimension and the live force simulation make a direct port wrong.

This ADR was drafted from argument alone and then **corrected by a prototype** (branch `prototype/3d-overlay-chrome`, variants A–D on `/?variant=`). Three of its original decisions did not survive contact with a running scene. The superseded positions are recorded below, because the reasoning that produced them is plausible enough to be re-proposed otherwise.

## Context & Decision

- **Docked panel, not floating chrome**: All hit targets — Action Handles, the name input, the kinship picker — live in a panel docked to the screen edge, with a dashed leader line to the selected planet. Chrome that floats at the anchor was prototyped (variant A) and judged prettier but harder to use; a docked panel is never occluded, never off-screen, and never shrinks to a few pixels at distance.

- **Non-interactive spatial preview**: When a relative is being created, a translucent ghost planet appears in the scene at a camera-relative offset from the anchor, with a dashed tether and the typed name floating above it. It is decorative: no raycasting, no pointer events, no hit testing. This is what separates the feature from the `PersonDetailDrawer` path that already exists in 3D — you can see what you are building and where it will land, without putting click targets into a crowded, occluded space.

- **No Manipulation Freeze**: The force simulation and camera keep running throughout. *Superseded:* we originally specified freezing both, reasoning from ADR 0001's "zero layout jitter while typing" promise. That promise only matters for chrome anchored to a drifting node; docked chrome does not drift. The prototype's preview marker rides the simulation and reads as alive rather than unstable. Freezing a cosmic scene mid-interaction was solving a problem the docked panel had already removed.

- **Camera-relative direction as a hint, not an interaction**: "Up = Parent, down = Child, lateral = Spouse" is resolved against the camera basis and used to place the *preview marker*. *Superseded:* it was originally the layout rule for clickable directional handles, which a docked panel makes meaningless — a stacked list of buttons has no "up". World-axis placement remains rejected: the force layout has no genealogical axis, so world-up would put the preview behind the planet from roughly half of all viewpoints.

- **Selection-only reveal**: The panel populates on selection. *Superseded in significance:* this was originally framed as a deliberate divergence from ADR 0001's hover-or-select model, justified by depth-overlap flicker. With a docked panel it is simply how a panel works, and needs no special defence.

- **Animation lifecycles are shared, renderings are not**: Supernova and black-hole collapse are the 3D renderings of **Spawn** and **Dissolve**, not new lifecycles — same triggers, same optimistic-update and rollback semantics. The 2D `SpawnBurst` / `ParticleDissolve` SVG particle systems are not portable and are reimplemented in Three.js. Link-growth pulses reuse the graph's built-in `linkDirectionalParticles`; hand-written effects are capped and disabled under `isMobile()`, alongside the existing geometry and material reductions.

- **Desktop-only for v1**: Touch has no hover model and two-click targeting fights pinch-zoom. Mobile 3D retains the existing `PersonDetailDrawer` path, which is already a complete route to every action. Recorded as a known gap, not an omission.

## Constraints discovered by the prototype

- `react-force-graph-3d` does **not** expose `graphData()` as a ref method — it is a prop only (see the library's `methodNames` list). Live node positions must be read from the array passed to the `graphData` prop, which d3-force mutates in place.
- In-scene sprites cannot be made clickable without hand-rolling a raycaster the graph does not provide for non-node objects. This is why variant B was never viable as an interaction surface, independent of how it looked.
