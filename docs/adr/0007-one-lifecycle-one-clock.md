# 0007 One Lifecycle, One Clock

We decided to make **Spawn** and **Dissolve** single lifecycles in code as well
as in `CONTEXT.md`: one pure module (`src/lib/lifecycle.ts`) owning phase, clock
and unwind for both lifecycles and both Lifecycle Subjects (Tree Node and
Kinship Link), one React controller (`src/hooks/useLifecycles.ts`) owning the
single frame loop and the write it is optimistic about, and the 2D and 3D
renderings reduced to adapters that are handed a progress.

> Numbering note: `docs/adr/` contains two files numbered 0004, pre-existing on
> `main`. Renumbering is left to a separate housekeeping change.

## Context & Problem

`CONTEXT.md` and ADR-0002 both say Spawn and Dissolve are one lifecycle rendered
two ways. The code disagreed. A single Dissolve ran on three clocks:

| Clock | Duration | Where |
|---|---|---|
| `cardDissolve` CSS | 450 ms | `NodeCard.tsx` |
| particle `setInterval` sim | ~1000 ms | `ParticleDissolve.tsx` |
| release timer | 1600 ms | `FamilyTree.tsx` |

and the 3D collapse ran on a fourth (1100 ms). Spawn was worse: a hardcoded
3500 ms release, a 550 ms card pop, an interval-driven burst, a 1400 ms
supernova, and a separate 3500 ms `BEAM_PULSE_WINDOW_MS` for the link.

Four further leaks followed from the fragmentation:

- **The completion signal was unreachable.** `ParticleDissolve` was rendered by
  iterating the *post-refetch* node list, so the node vanished before its
  particles expired: `onComplete` never fired, the `onDissolveComplete` handler
  was dead, and the 1600 ms timer was the real releaser — while the comment
  above it asserted the opposite. `SpawnBurst.onComplete` was never even passed.
- **Rollback was a flag reset**, racing the timer that would have cleared the
  same flag anyway. No graph state was restored, and nothing was unwound.
- **Two delete paths.** The in-canvas Dissolve, and the `PersonDetailDrawer`
  Delete with a native `window.confirm` and no animation at all.
- **The 2D delete affordance was not permission-gated.** The handle was gated on
  edit rights (1-degree), the handler bailed on `!isAdmin`. A non-admin relative
  saw the handle, saw the shake, clicked ✓, and got silence. 3D had the gate;
  2D had no equivalent.

## Decision

1. **A pure machine, on the `directManipulation.ts` precedent (ADR-0004).**
   `src/lib/lifecycle.ts` is synchronous and DOM-free; time arrives as a `now`
   argument. State is a map keyed by `(kind, subject)`, so lifecycles for
   different subjects run concurrently and a repeat Spawn for the *same* subject
   supersedes rather than inherits. The 3D scene's own one-effect budget stays
   in `useCosmicFx`, where it belongs — it is a rendering constraint, not a
   domain rule.

2. **The module is the sole authority on time.** One constant per
   (view × lifecycle × subject); `COSMIC_FX_DURATION_MS` is now derived from
   them, so a supernova cannot drift from the Spawn it renders. Renderings take
   a `progress` and have no timers: `SpawnBurst` and `ParticleDissolve` lost
   their `setInterval` and their `onComplete`, and the `cardSpawnPop` /
   `cardDissolve` CSS keyframes became functions in `src/utils/canvasFx.ts`
   (CSS cannot be handed a progress). The card's window now runs *inside* the
   particle window instead of beside it.

3. **A geometry snapshot, taken once.** The lifecycle pins where its subject was
   and the renderings draw from that, not from the live layout. This is what
   makes a Dissolve survive its own write: the refetch may delete the node
   mid-flight and the animation still plays out.

4. **`run(subject, commit)` sequences the write.** The hook starts the
   lifecycle, awaits the `treeRecord` call underneath it, and aborts on
   rejection; the pure machine still never awaits anything. `treeRecord` remains
   the only writer.

5. **Abort is a real unwind.** `ABORT` re-runs progress from wherever it had
   reached back down to zero, re-materializing a node whose delete failed.

6. **Both subjects, from day one.** A Kinship Link is a Lifecycle Subject, so
   the beam pulse is the 3D rendering of a link Spawn and 2D path growth is the
   2D one — no separate `pulsingLink` state, no separate window. Link Dissolve
   falls out for free, and `AdminManageLinksModal` now deletes through it.

7. **One controller prop per view**, replacing six loose animation props, on the
   same argument ADR-0004 made for `interaction`.

8. **The drawer's Delete asks the canvas's question.** It dispatches
   `startDissolve` instead of raising `window.confirm`, so one confirmation
   flow and one animation serve both entry points.

9. **2D gates the Dissolve handle per node** (`canDissolveNode`), the equivalent
   of 3D's `canDissolveSelected`. Dissolve remains admin-only; the handle simply
   stops appearing to people it would ignore. Widening dissolve rights to all
   1-degree editors is a permissions decision and is deliberately not made here.

## Considered and Rejected

- **Letting renderings report completion, with a timeout backstop.** Rejected:
  the unreachable `onComplete` *was* that design. A backstop timer that always
  wins is a second clock wearing a disguise.
- **Delaying the refetch until the animation finishes.** Rejected: it couples
  perceived write latency to animation length, and it does not survive a slow
  network. The snapshot solves the same problem without holding the write.
- **Hand-patching local graph state on failure.** Rejected: that is LIN-58's
  job, and LIN-58 is blocked by this issue. The lifecycle owns the *visual*
  half of the rollback; restoring the data stays a `refetch()` until there is a
  store that can be updated rather than only re-downloaded.
- **Making 2D and 3D share one duration.** Rejected: ADR-0002 keeps the views
  visually independent. One clock means one owner, not one number.
- **Putting phase names, durations or module names into `CONTEXT.md`.**
  Rejected: it is a glossary. Only **Lifecycle Subject** was added, because the
  thing a lifecycle happens *to* had no name.

## Consequences

- One duration table replaces seven scattered timings; the `+500 ms` fudge and
  the 3500 ms release are gone.
- The phase machine is tested in `environment: 'node'` with an injected clock,
  including the regression this module exists for: a Dissolve started for a node
  completes after that node has left the graph.
- A failed delete now visibly puts the person back, rather than silently
  clearing a flag.
- 2D gained a link Spawn rendering it never had (the `linkGrow` keyframe was
  dead CSS), and a link Dissolve.
- Per-frame progress is delivered by subscription, so a playing animation
  re-renders the leaves drawing it rather than the whole canvas.
