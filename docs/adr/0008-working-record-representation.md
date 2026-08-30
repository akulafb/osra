# 0008 Working Record Representation

Optimistic writes need an in-browser set of Persons and Kinship Links that can be updated
rather than re-downloaded. We hold it as an **immutable confirmed snapshot plus an ordered list
of Pending Changes**, derive the Working Record from those two, and project it into node objects
whose identity is reused whenever a Person's facts are unchanged. Changes go *in*; only a
snapshot comes *out*.

**Issue**: [LIN-58](https://linear.app/linearfb/issue/LIN-58) — Arch 06, from
`docs/plans/2026-08-17-architecture-review.md`. Shipped on
`akulafb/lin-58-arch-06-a-graph-store-that-can-be-updated-not-only-refetched`; the module is
`src/lib/workingRecord.ts` and its owner is `src/hooks/useWorkingRecord.ts`.

## Decision

1. **Changeset in, snapshot out.** A change enters the Working Record as a value
   (`person-upsert`, `person-remove`, `link-upsert`, `link-remove`). The only thing that comes
   out is an immutable `{ nodes, links }` snapshot of the shape the read path already returned,
   so every existing reader kept working. Nothing outside the module applies changes to
   anything.

2. **State is `{ confirmed, pending }`; the Working Record is derived.** `confirmed` is the last
   thing the server said. `pending` is an ordered list of Pending Changes. The Working Record is
   `confirmed` folded with `pending`, recomputed on every transition. There are **no inverse
   operations**: reverting a Pending Change removes it from the list and recomputes. Drift is
   impossible because nothing is ever incrementally patched.

3. **Node object identity is reused per Person id when that Person's facts are unchanged.** A
   Person whose facts changed yields a *new* object with `x/y/z/fx/fy/fz` carried across;
   every untouched Person keeps the object the simulation is already holding.

4. **`warmupTicks` is `160` for the initial load and `0` for every subsequent rebuild.** This is
   the only lever that makes an optimistic write cheap, and it is the one this ADR exists to
   record.

5. **Permission derivation reads `confirmed`; rendering and Person Match read the Working
   Record.** `canEdit` computes the 1-degree network from Kinship Links, and the server computes
   the same perimeter from persisted rows. Deriving affordances from unpersisted links
   guarantees the client offers writes the server will refuse.

## Why 3 and 4 are not interchangeable

Verified against the vendored source, `react-force-graph-3d@1.29.1` →
`three-forcegraph@1.43.0` → `d3-force-3d@3.0.6`:

- The re-heat and the warmup loop are gated purely on the **prop reference** changing —
  `hasAnyPropChanged(['graphData', …])` → `.stop().alpha(1).nodes(…)`
  (`three-forcegraph.mjs:1399, 1413`), then `for (i < state.warmupTicks) layout.tick()`
  (`:1475`), then `resetCountdown()` restarts the full `cooldownTicks` budget (`:1480`).
  **Contents are never inspected.** Preserving member identity does not avoid a single tick.
- Mutating the array in place and re-passing the same reference is **invisible**: react-kapsule
  only propagates a prop when `prevPropsRef.current[p] !== props[p]`
  (`react-kapsule.mjs:106-107`). A new wrapper object is required to be noticed and sufficient
  to pay the full cost. There is no "rebind without re-heat" method — the ref surface offers
  `d3ReheatSimulation()` (re-heat, no rebind) and `refresh()` (rebuild every three.js object,
  no rebind) and nothing in between (`react-force-graph-3d.mjs:125-130`).
- So decision 3 buys exactly two things, and neither is the warmup: the four three.js caches
  are keyed by the data object itself (`data-bind-mapper.mjs:114-117` — `three-forcegraph`
  never overrides `.id()` on the node mapper), so meshes and materials are not disposed and
  rebuilt; and `initializeNodes()` only seeds `x/y/z` when `NaN` and **never clears
  `fx/fy/fz`** (`d3-force-3d/src/simulation.js:76-105`), so positions and pins survive without
  being copied.
- Decision 4 is possible because `warmupTicks` is declared `triggerUpdate: false`
  (`three-forcegraph.mjs:652-655`): it is read when an update runs, so changing it does not
  itself cause one.

The re-heat that remains after decision 4 is wanted. `alpha(1)` over preserved positions is a
settle, not an explosion, and pinned Tree Nodes do not move at all.

## Considered and rejected

- **Reconcile members into one long-lived array handed to `graphData`.** Rejected: the source
  above shows the cost is paid on prop identity, so a stable array is either invisible to the
  library or costs exactly the same as a fresh one. This was the first design and it does not
  work.
- **Reusing a Kinship Link object whose endpoint node object was replaced.** Rejected:
  `initialize()` resolves an endpoint id into a node object *on the link object itself* and skips
  any endpoint that is already an object — `if (typeof link.source !== "object") link.source = …`
  (`d3-force-3d/src/link.js:66-67`). A link object that survives a projection therefore
  keeps the node object it was first bound to, and goes on pulling towards the Person the
  projection just discarded. `projectLinks` reuses a Kinship Link only while each of its endpoints
  is either still an unresolved id or the very node object this projection is handing out, and
  re-mints one whose endpoint identity is stale (`workingRecord.ts:339-362`). This is the price of
  decision 3, and it is why link reuse is conditioned on node reuse rather than decided
  independently.
- **A changeset as the module's *output*, applied incrementally by each view.** Rejected: an
  incrementally patched array drifts permanently if a change is dropped, re-ordered or applied
  twice, and nothing can detect the drift. Deriving from `{ confirmed, pending }` cannot drift.
- **Inverse operations for rollback.** Rejected: removing a Pending Change from a list and
  recomputing is correct for any number of concurrent Pending Changes; a stack of inverses is
  correct only if they unwind in order.
- **Provisional client ids swapped for real ones on confirmation.** Rejected: `lifecycleKey` is
  keyed on the subject id (`lifecycle.ts:99-106`) and `CAPTURE_GEOMETRY` is first-capture-wins,
  so re-keying mid-flight would restart or orphan a playing Spawn. Persons therefore carry a
  client-generated uuid from the start, and Kinship Links stay id-less while pending.
- **Reporting server-side corrections to the caller.** Rejected: the server row wins wholesale.
  Names are already normalised client-side before the request (`treeRecord.ts:371-386`), and the
  one genuine server-side block `RAISE`s
  (`20260817140000_lin59_server_side_admin_write_gates.sql:274, 277`) and so arrives as a
  rejection, not a difference. A correction channel would have no consumer.
- **Enabling Supabase Realtime in this change.** Rejected for now, but decision 1 is chosen so
  it is additive: a Postgres `INSERT`/`UPDATE`/`DELETE` is already the same
  `person-upsert`/`link-remove` vocabulary a local write speaks. `realtime.eventsPerSecond` is
  `0` and the read path uses raw `fetch` to avoid a websocket hang; inheriting that problem
  would sink this change.
- **Background refresh on window focus or an interval.** Rejected: "when should we re-read the
  server" is the realtime question wearing a smaller hat.

## Consequences

- **The tree no longer picks up other people's writes.** The post-write `refetch()` incidentally
  refreshed everything; removing it leaves the canvas stale for the session, as the chat copy
  already was. This is the strongest argument for a change feed and is recorded as such rather
  than mitigated here.
- **`carryPositions` narrowed into the projection rather than disappearing.** It no longer runs
  over every node on every fetch: `projectWorkingRecord` carries `x/y/z/fx/fy/fz` across only for
  a Person whose facts changed, and the standalone helper is gone (`workingRecord.ts:142-155`).
- **A pending Kinship Link has no id**, so the one operation it cannot serve is its own
  deletion, for about one round-trip.
- **`useNewNodesSinceSignIn` is fed the confirmed Persons, not the Working Record.** Its
  fingerprint is `${userId}|${nodes.length}|${maxTs}` and it filters on `createdAt`
  (`useNewNodesSinceSignIn.ts:87`, `:114`), and an optimistic Person has no `createdAt` until the
  database assigns one — so a pending Person would churn the fingerprint the guard exists to hold
  still, without ever being counted. Its own comment records that a duplicate commit already
  caused it to clear the button prematurely.
- **`already_connected` is load-bearing.** `link_existing_relative_secure` can return
  success having inserted nothing, so a write has three outcomes, not two: confirmed, reverted,
  and accepted-but-empty. Reading it closes a real duplicate-link defect that ADR-0005 recorded
  as unread.
- **An optimistic Person carries no family cluster.** `create_relative_secure` derives
  `paternal_family_cluster` and `maternal_family_cluster` from the anchor and the anchor's spouse,
  so the client cannot predict either and leaves both absent rather than guessing
  (`AddRelativeModal.tsx:166`). The visible cost is that while the view is narrowed to a subset of
  clusters, a pending Person is not drawn at all: both cluster filters exclude a Person with no
  cluster (`filterGraphData.ts:173` for 3D, `:20-22` for the 2D preset). The Person appears when
  the server answers. The admin path is unaffected — there the user typed the clusters, so the
  optimistic Person carries them (`AdminAddPersonModal.tsx:73-78`).
- **An id-less pending Kinship Link that duplicates one the record already holds is not folded in
  at all.** A pending link is keyed by `source|target|type`, so the fold can see that the record
  already carries that pair and drops the pending one (`workingRecord.ts:185-189`). This is
  `already_connected` a round-trip before the server says so, and it is what keeps the canvas from
  drawing a duplicate edge in between.
- **`isClaimed` is carried across confirmation.** It is derived from `public.users.node_id` by a
  separate RPC, so no `nodes` row can report it. Letting the server row win wholesale would
  therefore clear a Person's claim indicator on every rename, so the fold keeps the held value
  when the reported row has none (`workingRecord.ts:231-242`). It is the one exception to that
  rule, and it is a carry, not a merge.

Numbering note: `docs/adr/` contains two files numbered 0004
(`0004-direct-manipulation-state-machine.md`, `0004-server-side-write-authorization.md`),
pre-existing on `main`. Renumbering is left to a separate housekeeping change.
