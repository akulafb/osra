# 0011 Camera Stability and the Cinematic Intro Zoom

The 3D scene blacked out because `onNodeClick` passes `(node, event)` and our handler read the
second argument as a focus duration. The camera is left alone; the **callback signature** is
fixed, and the focus animation refuses a non-finite duration. The intro zoom is a declarative
`cameraPosition` pair — `z: 30000` at duration 0, then `z: 650` over 4500 ms.

> **Recorded retroactively on 2026-08-30**, while retiring
> `docs/plans/2026-03-10-camera-stability-and-intro-zoom-{design,plan}.md`. Those two documents
> were written *before* the root cause was known and prescribed fixes that were built and then
> deliberately deleted. This ADR exists so the deletion is not mistaken for an omission. The
> decision itself shipped in PR #54 (`4720d49`), merged 2026-03-10.
>
> Numbering note: `docs/adr/` contains two files numbered 0004, pre-existing on `main`.
> Renumbering is left to a separate housekeeping change.

## Context & Problem

Clicking a distant Tree Node blacked out the entire 3D scene. The state was persistent: "Reset
View" animated *from* the broken position, so it propagated the fault rather than clearing it.

The scene had also lost its cinematic fly-in from deep space in an earlier change.

**The first diagnosis was wrong, and it is the reason this ADR is worth having.** The symptom —
a camera position of `NaN` — was read as the cause, and the shape of the fix followed from that
reading: clamp how far the camera may travel, and teleport it home when it goes non-finite. Both
were built. Neither was kept.

The actual cause is a callback signature mismatch. `react-force-graph-3d` invokes
`onNodeClick(node, event)`. Our handler's second parameter was a focus duration in milliseconds,
so it received a `MouseEvent`. `Date.now() - startTime` divided by that object yields `NaN`, the
animation's progress term is `NaN`, and the camera position it lerps to is `NaN`. Nothing about
distance, depth precision or culling was involved — a node one unit away would have done it
just as reliably as a distant one. It looked distance-related only because distant nodes are
what people were clicking.

## Decision

1. **Fix the signature at the seam, not the symptom downstream.** `handleGraphNodeClick`
   (`FamilyTree3D.tsx:700-708`) is the only thing wired to `onNodeClick`, and it forwards **only
   the node** to `handleNodeClick`. The library's second argument never reaches a numeric
   parameter again.

2. **The focus animation refuses a duration it cannot use.**
   `typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : FOCUS_DURATION`
   (`FamilyTree3D.tsx:648-650`). Decision 1 makes this unreachable today; it is kept because the
   failure it guards is silent, total and indistinguishable from a rendering bug.

3. **The intro zoom is two declarative `cameraPosition` calls, not an animation loop.** Position
   at `{ 0, 0, 30000 }` with duration `0` once the graph has nodes, then `{ 0, 0, 650 }` over
   `4500` ms after a `500` ms delay, gated on `hasIntroPlayed` and on the simulation having
   finished loading (`FamilyTree3D.tsx:1584-1604`). `cameraPosition` is used throughout because
   it syncs `OrbitControls` internally; moving `camera.position` directly does not.

## Considered and rejected

Everything here was **written, committed, and then deleted within PR #54**. Each is plausible
enough to be re-proposed by someone reading the same symptom.

- **A distance clamp on node focus (`MAX_DIST = 150000`).** Rejected: the camera was never
  travelling too far. It was travelling to `NaN`, which no bound constrains — `NaN > 150000` is
  `false`, so the clamp would not have fired even once.
- **A "hard reset" branch in `resetView` that teleports to `{ 0, 0, 650 }` when the camera
  position is `NaN`.** Rejected: a recovery path for a state that can no longer be reached is
  untested code guarding an impossible condition, and it invites the fault to be treated as
  something the app recovers from rather than something it does not do.
- **`rendererConfig={{ logarithmicDepthBuffer: true, … }}`.** Rejected: a speculative guess that
  the blackout was depth-buffer precision at distance. It was not, and the flag has real costs on
  a scene this size.
- **`frustumCulled = false` on the stars and nebula clouds, and `fog: false` on their
  materials.** Rejected with the same reasoning — a guess that background geometry was being
  culled or fogged out at extreme camera distances. `src/utils/starfield.ts` carries none of
  these today, deliberately.

## Consequences

- `resetView` (`FamilyTree3D.tsx:784-834`) has **no** `NaN` branch, and `handleNodeClick` has
  **no** distance clamp. Both absences are decisions. Do not add them back to fix a black
  screen — check what is being passed to `onNodeClick` first.
- The guard in decision 2 is the one surviving piece of defence-in-depth, and it is deliberately
  the cheap kind: a type check at a boundary rather than a recovery mechanism.
- Camera distance is unbounded. Nothing has needed it to be bounded since.
