# LIN-58 — A Working Record that can be updated, not only refetched

**Status**: spec, awaiting implementation
**Issue**: [LIN-58](https://linear.app/linearfb/issue/LIN-58) — Arch 06, from `docs/plans/2026-08-17-architecture-review.md`
**Branch**: `akulafb/lin-58-arch-06-a-graph-store-that-can-be-updated-not-only-refetched`
**Depends on**: [LIN-63](https://linear.app/linearfb/issue/LIN-63) *one owner of the graph in
memory* and [LIN-64](https://linear.app/linearfb/issue/LIN-64) *complete the write seam's return
contract* — **both shipped**.

Produced by grilling the issue. The issue said "re-verify the problem still exists before
grilling this; 01 and 03 may have moved it." They had: two of its five evidence claims are dead,
and the two facts that actually decide the design were not in the issue at all.

## Re-verification — 2026-08-26

| # | Claim (2026-08-17) | Verdict | Current truth |
|---|---|---|---|
| 1 | `await write; await refetch()`, no optimism, 11 sites | **Partly false** | 12 sites. Data is never optimistic, but Dissolve is *visually* optimistic via `lifecycles.run` (ADR-0007). |
| 2 | Spawn waits three round-trips before it can start | **True, understated — four** | `record.addPerson` (`FamilyTree.tsx:207`) → `await refetch()` (`:217`) = 3 sequential fetches (`useFamilyData.ts:102, 121, 143`) → `lifecycles.start` (`:221`). |
| 3 | Pinned positions destroyed on refetch | **False — LIN-55 fixed it** | `carryPositions` copies `x/y/z/fx/fy/fz` onto every re-minted node (`useFamilyData.ts:37-82`). |
| 4 | 2D viewport recentres mid-animation | **False — fixed** | Fit effect reads `boundsRef`, deps `[activePreset, layoutType, collapsedKey, isEmpty]`; a layout-pin effect counter-translates the zoom transform (`FamilyTree2D.tsx:267-345`). |
| 5 | Two copies of the graph; chat goes stale | **Was true — LIN-63 fixed it** | One provider owns the graph (`src/contexts/FamilyDataContext.tsx`); the chat consumes it. Load went from 6 requests to 3, and a Spawned Person now reaches the LLM. See [ADR-0009](../adr/0009-one-owner-of-the-graph-in-memory.md). |

**Where the citations above now live.** LIN-63 moved `src/hooks/useFamilyData.ts` to
`src/contexts/FamilyDataContext.tsx` (row 5). Line references in this table are as of
2026-08-26 and were not rewritten; in the new file `carryPositions` is `:59-109` (row 3) and the
three sequential fetches are `:125, :144, :166` (row 2).

**Four findings the issue does not record, in descending order of how much they changed the design:**

1. **The write seam returns almost nothing.** `addPerson` → `{ id?: string }`; the other five →
   `Promise<void>`. Three writes send `Prefer: return=minimal` (`treeRecord.ts:290, 389, 419`).
   `addLink` never yields a Kinship Link id; `removePerson` never reports its cascade. Nothing
   optimistic can be confirmed from a response today. ADR-0003 specified the six operations and
   the error kinds and simply never specified return values — an unfinished contract, not a
   violated one. **Closed by LIN-64**: all six return `ConfirmedRows`, `addLink` also returns
   `alreadyConnected`, and `src/lib/treeRecordRows.ts` decodes rows for both directions of the
   seam ([ADR-0010](../adr/0010-write-seam-return-contract.md)).
2. **Preserving node object identity does not avoid the 3D re-warm.** The re-heat and the
   `warmupTicks` loop are gated on the `graphData` *prop reference* changing, never on contents
   (`three-forcegraph.mjs:1399, 1413, 1475`), and re-passing the same reference is invisible to
   react-kapsule (`react-kapsule.mjs:106-107`). The lever is `warmupTicks` itself, which is
   declared `triggerUpdate: false` (`:652-655`). Full reasoning in ADR-0008.
3. **Client-side permissions would outrun the server.** `canEdit` derives the 1-degree network
   from Kinship Links (`FamilyTree.tsx:83, 180` → `permissions.ts:61`), and the server computes
   the same perimeter from *persisted* rows (second ADR-0004). Optimistic links would grant
   affordances for writes the server refuses.
4. **The server has a success-with-no-effect outcome.** `link_existing_relative_secure` can
   return `{ success: true, already_connected: true }` having inserted nothing
   (`20260817140000_lin59...:129-133`). ADR-0005 recorded that `already_connected` "is still
   read by nothing". A write therefore has three outcomes, not two.

Also: `rel_type = 'sibling'` inserts Kinship Links **in a loop**
(`20260406120000_lin22_first_name.sql:161-169`), so one `addPerson` creates *N* links; and node
ids are server-generated (`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `RETURNING id INTO
new_id`) with no parameter to supply one.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | LIN-58 keeps **only** the updatable Working Record. Two spin-offs are filed and land first: (A) one owner of the graph in memory, (B) complete the write seam's return contract | (A) fixes a user-visible bug today and should not wait behind the largest change in the review; (B) is a DB migration, and gating a migration behind a speculative Exploration ticket is how migrations get rushed. |
| D2 | Done means: **a failed write no longer calls `refetch()`, and a Spawn starts before the network resolves.** Latency is a consequence, never a justification | The issue's own "payoff is partly performance — which nobody has complained about". Two ADRs already promised optimism (ADR-0001 "an optimistic spring pop", ADR-0002 "same optimistic-update and rollback semantics"); this pays a booked debt. |
| D3 | Hand-rolled pure module in `src/lib/`. **No new dependency** | The precious state is mutable simulation state on the node objects; a cache library's core competence — replacing those objects — is our core hazard. And `environment: 'node'` with `include: ['src/**/*.test.ts']` means a pure module is the only shape testable in this repo today. |
| D4 | Local optimism only. The change-in seam is shaped so a Postgres change feed can drive it later; **Realtime is not enabled** | An `INSERT`/`UPDATE`/`DELETE` is already the same vocabulary a local write speaks, so collaboration becomes additive rather than a rewrite. But `realtime.eventsPerSecond` is `0` and `useFamilyData` uses raw `fetch` to avoid a websocket hang; inheriting that would sink this change. |
| D5 | **Changeset in, snapshot out.** State is `{ confirmed, pending }`; the Working Record is derived, never incrementally patched | An incrementally patched array drifts permanently if a change is dropped, re-ordered or double-applied, and nothing can detect it. Deriving cannot drift. |
| D6 | **No inverse operations.** Reverting drops the Pending Change and recomputes | Correct for any number of concurrent Pending Changes; a stack of inverses is correct only if it unwinds in order. |
| D7 | Node object identity is reused per Person id when facts are unchanged; a changed Person gets a new object with `x/y/z/fx/fy/fz` carried across | Keeps the three.js caches (keyed by the data object itself) and preserves positions and pins. `carryPositions` narrows from every-node-every-fetch to one node. |
| D8 | **`warmupTicks` is 160 for the initial load and 0 thereafter** | The only lever that makes an optimistic write cheap; see finding 2 and ADR-0008. The remaining `alpha(1)` re-heat is wanted: over preserved positions it is a settle, and pinned Tree Nodes do not move. |
| D9 | A **sequencer outside the lifecycle** owns `apply → write → confirm \| revert \| drop`. Lifecycle-bearing paths nest it inside `lifecycles.run` | Four of the twelve write paths have no lifecycle at all (`FamilyTree.tsx:571, 581, 596, 609`); putting optimism in `useLifecycles` would leave them with none and create two data paths. Layers, not duplicates: one writer, one clock, one sequencer. |
| D10 | Three outcomes: **confirmed, reverted, and accepted-but-empty** | `already_connected` means the server can succeed having done nothing. Dropping the Pending Change with no error closes a real duplicate-link defect as a side effect. |
| D11 | Persons carry a **client-generated uuid**; pending Kinship Links are **id-less** until confirmed | `lifecycleKey` is keyed on the subject id (`lifecycle.ts:99-106`) and `CAPTURE_GEOMETRY` is first-capture-wins, so a provisional id swapped later would restart or orphan a playing Spawn. `FamilyLink.id` is already optional, so id-less links cost nothing structurally, and this avoids minting *N* ids for the `sibling` loop. |
| D12 | **`confirm()` — the server row wins wholesale** | One rule, no merge, and byte-for-byte the same path a realtime `UPDATE` will take. Names are normalised client-side before the request (`treeRecord.ts:371-386`) and the one genuine server block `RAISE`s, arriving as a rejection rather than a difference. |
| D13 | Rendering and Person Match read the Working Record; **permission derivation reads `confirmed` only** | Revert already has to keep the confirmed set, so exposing it costs nothing — and it makes the client's perimeter agree with the server's by construction rather than by luck. Excluding pending Persons from the match pool would create permanent duplicates; ADR-0005's reasoning verbatim. |
| D14 | **No background refresh.** The retry button keeps a full reload; the seven post-write awaits and two rollback refetches go away | "When should we re-read the server" is the realtime question wearing a smaller hat. The staleness regression is recorded in ADR-0008 as the argument for D4's second half. |

## Module contract

```ts
// src/lib/workingRecord.ts

import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';

/** Handle for one Pending Change. Local only — never a database id. */
export type ChangeId = string;

/** A primitive change to the Tree Record. The vocabulary a Postgres change feed also speaks (D4). */
export type RecordChange =
  | { kind: 'person-upsert'; person: FamilyNode }
  | { kind: 'person-remove'; id: string }
  | { kind: 'link-upsert'; link: FamilyLink }
  | { kind: 'link-remove'; id: string };

/**
 * One thing the user did, and the changes it makes to the record.
 * A sibling addition is one Pending Change with several `link-upsert`s (N-link loop).
 */
export interface PendingChange {
  changeId: ChangeId;
  changes: RecordChange[];
}

export interface WorkingRecordState {
  /** The last thing the server said. */
  confirmed: FamilyGraph;
  /** Ordered. Folded onto `confirmed` to derive the Working Record. */
  pending: PendingChange[];
}

/** What a write reported back. Shapes what spin-off (B) makes `treeRecord` return. */
export interface ConfirmedRows {
  persons?: FamilyNode[];
  links?: FamilyLink[];
  removedPersonIds?: string[];
  removedLinkIds?: string[];
}

export function emptyWorkingRecord(): WorkingRecordState;

/** Initial load and retry only (D14). Discards nothing pending. */
export function withConfirmedSnapshot(
  state: WorkingRecordState,
  snapshot: FamilyGraph
): WorkingRecordState;

export function applyPending(
  state: WorkingRecordState,
  changeId: ChangeId,
  changes: RecordChange[]
): WorkingRecordState;

/** Server accepted and reported rows: fold them into `confirmed`, drop the Pending Change (D12). */
export function confirmPending(
  state: WorkingRecordState,
  changeId: ChangeId,
  rows: ConfirmedRows
): WorkingRecordState;

/** Server rejected: drop the Pending Change, `confirmed` untouched (D6). */
export function revertPending(state: WorkingRecordState, changeId: ChangeId): WorkingRecordState;

/** Server accepted having done nothing — `already_connected` (D10). Same effect, not an error. */
export function dropPending(state: WorkingRecordState, changeId: ChangeId): WorkingRecordState;

/**
 * The only output (D5). `previous` supplies node objects to reuse by Person id when that
 * Person's facts are unchanged (D7); pass `null` on first projection.
 */
export function projectWorkingRecord(
  state: WorkingRecordState,
  previous: FamilyGraph | null
): FamilyGraph;

/** Permission derivation reads this, never the projection (D13). */
export function confirmedLinks(state: WorkingRecordState): readonly FamilyLink[];
```

### Rules

- Folding order is `confirmed`, then `pending` in list order. A later `person-upsert` for the
  same id wins; a `person-remove` wins over an earlier `person-upsert` for that id.
- **The removal cascade is not re-implemented.** `person-remove` alone is enough: the projection
  ends with `dropOrphanLinks` (`sanitizeFamilyGraph.ts`), which already removes any Kinship Link
  whose endpoint is absent — the same function `useFamilyData` calls twice per fetch today. The
  server's `removedLinkIds` are folded into `confirmed` on confirmation, so the SQL cascade is
  never guessed in TypeScript.
- A `link-upsert` with no `id` is a pending Kinship Link. It renders; it cannot be the subject of
  a `link-remove` (D11). Reverting one drops its Pending Change, which needs no id.
- Reuse in `projectWorkingRecord`: a Person is reused when its facts are shallow-equal, ignoring
  `x/y/z/fx/fy/fz`. Otherwise a new object is minted and those six fields are copied from the
  previous one. Kinship Links are reused by `id`, or by `source|target|type` while pending.
- Links are shallow-cloned, never deep-cloned — ADR-0006 rejected deep cloning, and endpoints are
  `string | FamilyNode` because d3-force rewrites them in place. Endpoint reads go through
  `getNodeId`/`getLinkEndpoints`.
- Every function is pure and returns new state. No `Date.now()`, no `crypto.randomUUID()` inside
  the module: `changeId` and client Person ids are supplied by the caller so tests are
  deterministic.

## Controller contract

```ts
// src/hooks/useWorkingRecord.ts

export type WriteOutcome =
  | { kind: 'confirmed'; rows: ConfirmedRows }
  | { kind: 'empty' }; // already_connected (D10). A rejection throws TreeRecordError instead.

export interface WorkingRecordController {
  /** Rendering, filters, search, bounds and Person Match read this (D13). */
  working: FamilyGraph | null;
  /** `canEdit` / `canDissolveNode` / `canManageInvites` read this (D13). */
  confirmedLinks: readonly FamilyLink[];
  isLoading: boolean;
  error: string | null;
  /** Full re-read. Retry button only (D14). */
  reload: () => Promise<void>;
  /** apply → commit → confirm | revert | drop (D9). Rethrows a rejection after reverting. */
  write: (changes: RecordChange[], commit: () => Promise<WriteOutcome>) => Promise<void>;
}
```

`write` is the whole sequencer:

1. `applyPending(changeId, changes)` — the canvas updates now.
2. `await commit()` — `treeRecord` remains the only writer (ADR-0003).
3. `{ kind: 'confirmed', rows }` → `confirmPending`. `{ kind: 'empty' }` → `dropPending`.
   Throw → `revertPending`, then rethrow so the caller can alert.

## Caller behaviour

### `FamilyTree.tsx` — the twelve refetch sites

| Site | Today | After |
|---|---|---|
| `:207` + `:217` create relative | `addPerson` then `await refetch()` then `lifecycles.start` | `lifecycles.start` **first** (client-generated Person id, D11), then `write([person-upsert, link-upsert], …)`. Spawn no longer waits on any round-trip. |
| `:250` + `:251` connect existing | `addLink` then `await refetch()` then `start` | `start` first, then `write([link-upsert], …)`. An `already_connected` response drops the Pending Change silently (D10). |
| `:276-281` dissolve Person | `lifecycles.run(removePerson)` then `await refetch()` | `lifecycles.run({ commit: () => write([person-remove], …) })`. No refetch. |
| `:287-290` dissolve rollback | `await refetch()` + alert | `revertPending` happens inside `write`; the handler keeps only the alert. **This is the line ADR-0007 deferred to this ticket.** |
| `:311-318` dissolve link | same shape | `write([link-remove], …)`; catch keeps `throw e` for the modal. |
| `:338-345` two-click connect | `addLink` then `await refetch()` then `start` | `start` first, then `write([link-upsert], …)`. |
| `:484` retry | `refetch()` | `reload()` — the only survivor. |
| `:571, :581, :596, :609` modals | `onSuccess={refetch}` / `void refetch()` | `onSuccess` removed; each modal calls `write` directly. No lifecycle, same optimism and rollback (D9). |

The Ghost Node currently stays on screen with `isSubmitting` through all four round-trips
(`GhostNodeCard.tsx:87-95`, dismissed at `FamilyTree2D.tsx:760-767`). It now dismisses
immediately — the Tree Node it becomes is already on the canvas.

### Permission call sites

`canEdit(selectedNode.id, …, graphData.links)` at `:83` and `canDissolveNode` at `:180` take
`confirmedLinks` instead. Mechanical, and it is what makes the client's 1-degree perimeter agree
with the server's (D13, finding 3).

### `FamilyTree3D.tsx`

- `warmupTicks={160}` becomes `warmupTicks={hasWarmedUp ? 0 : 160}`, flipped by a ref after the
  first non-empty projection (D8). Nothing else about the prop set changes.
- `filteredGraphData` is unchanged: it still returns a new wrapper object, which is required for
  the library to notice at all (finding 2).

### `useNewNodesSinceSignIn.ts`

Fingerprint becomes `${userId}|${confirmedNodeCount}|${maxTs}` and the hook is fed the
**confirmed** nodes. A pending Person is not "new" until the database says so, and its own
comment records that a duplicate `graphData` commit already caused this hook to clear the button
prematurely (`:24-25`).

## Tests

`src/lib/workingRecord.test.ts`, pure, `environment: 'node'`:

- `applyPending` then `projectWorkingRecord` shows the Person; `confirmed` does not contain it
- `revertPending` restores the previous projection exactly; `confirmed` never changed
- `dropPending` is indistinguishable from `revertPending` in its effect on state
- `confirmPending` folds server rows into `confirmed` and the Pending Change disappears
- server row wins on conflict: a differing `firstName` in `rows` overrides what was applied (D12)
- **two concurrent Pending Changes**: reverting the *first* leaves the second applied (D6)
- `person-remove` drops its Kinship Links from the projection without any `link-remove` (cascade
  via `dropOrphanLinks`)
- a pending Kinship Link projects with `id: undefined` and survives an unrelated confirmation
- identity reuse: an unrelated Person's node object is reference-identical across a projection
- identity replacement: an edited Person gets a new object with `x/y/z/fx/fy/fz` preserved (D7)
- `withConfirmedSnapshot` during an in-flight Pending Change keeps the Pending Change applied
- `confirmedLinks` excludes pending links (D13)
- folding precedence: `person-remove` after `person-upsert` for the same id removes

## Commits

1. `src/lib/workingRecord.ts` + tests. No caller touched.
2. `src/hooks/useWorkingRecord.ts` replacing `useFamilyData`'s internals; `write` sequencer;
   `carryPositions` narrowed into `projectWorkingRecord`.
3. Call sites converted: the twelve refetch sites, the four modals, the permission signatures,
   `warmupTicks`, `useNewNodesSinceSignIn`. All behaviour change lands here.
4. `CONTEXT.md` terms + `docs/adr/0008-working-record-representation.md`.

## Spin-off tickets — filed, and they land first (D1)

### [LIN-63](https://linear.app/linearfb/issue/LIN-63) — Arch 06a: One owner of the graph in memory — **shipped**

`useFamilyChat.ts:16` called `useFamilyData()` a second time and `<FamilyChat />` mounts
unconditionally (`FamilyTree.tsx:727`), so the page made **6 requests** on load and the chat's
copy re-read only on `[session, user]`. A Person Spawned after load was invisible to every
answer the LLM gave for the rest of the session. Needed no Working Record, no changeset, no
reconciler — and it was the only user-visible *bug* left in the original issue's evidence.

Landed as a provider: `FamilyDataProvider` in `src/contexts/FamilyDataContext.tsx` owns the state
and the fetch, `useFamilyData()` is a consumer with the same
`{ graphData, isLoading, error, refetch }` shape, and it is mounted around `<FamilyTree />` in
`HomePage`. Load is 3 requests; the chat answers from the Persons on the canvas.
[ADR-0009](../adr/0009-one-owner-of-the-graph-in-memory.md).

**What this changes for LIN-58.** Commit 2 replaces the *provider's* internals rather than a
hook two components call, so there is one seam to convert, and `write` can reach the four modals
through the same context instead of four new props. The `useFamilyData` / `graphData` names were
deliberately left alone for LIN-58 to rename to the Working Record vocabulary.

### [LIN-64](https://linear.app/linearfb/issue/LIN-64) — Arch 06b: Complete the write seam's return contract — **shipped**

ADR-0003 fixed the six operations and the error kinds and left return values unspecified. Every
write now returns what it wrote:

- `Prefer: return=minimal` → `return=representation` on `POST /links`, `PATCH /nodes`,
  `PATCH /links` — client-only, no migration
- `create_relative_secure`: accepts a caller-supplied Person uuid (D11) and returns the `nodes`
  row and every `links` row it wrote — the `sibling` branch writes one per parent, and the
  Person's two cluster fields are derived server-side from the anchor and the anchor's spouse, so
  the client could never have predicted them
- `admin_delete_node_secure`: returns the cascaded link ids
- `removeLink` already received the deleted rows under `return=representation` and discarded them
  — it returns them
- `already_connected` is surfaced from `link_existing_relative_secure`, so D10's third outcome is
  reachable

Landed as one shape for all six operations — `ConfirmedRows` — plus `alreadyConnected` on
`addLink`, and one decoder (`src/lib/treeRecordRows.ts`) shared with the read path in
`FamilyDataContext`. [ADR-0010](../adr/0010-write-seam-return-contract.md).

**Two things LIN-58 should know.**

1. `link_existing_relative_secure` had **never worked** for `parent`, `child` or `spouse`:
   `target_node_id` is both a parameter and a column of `public.links`, the duplicate-guard
   `EXISTS` blocks referenced it unqualified, and plpgsql raised `column reference
   "target_node_id" is ambiguous` into the function's own `EXCEPTION WHEN OTHERS`. So
   `already_connected` was unreachable rather than merely unread, and every non-admin "connect an
   existing relative" failed. Fixed by qualifying the columns.
2. `isClaimed` is not on a `nodes` row — it comes from a separate RPC over `public.users.node_id`.
   Under D12's "server row wins wholesale", confirming an `editPerson` will drop a Person's claim
   indicator unless `confirmPending` carries it across.

## Risks

- **The staleness regression is real.** Removing the post-write refetch removes the accidental
  freshness it provided. Nothing else in this change compensates, deliberately (D14).
- **D8 is the load-bearing measurement and it is unmeasured.** The vendored source proves 160
  synchronous ticks run per `graphData` rebuild; it cannot tell us the wall-clock cost at this
  graph's size. Measure with `performance.mark` around the prop change at `warmupTicks` 160 vs 0
  before trusting D8's payoff.
- **`alpha(1)` still fires on every optimistic write.** With `d3AlphaDecay={0.01}` and
  `cooldownTicks={1000}` the settle is long. Positions and pins survive, so it should read as
  drift rather than a jolt — but a Spawn now starts *during* that settle instead of after it,
  which nothing has ever done before. First thing to look at on the 3D canvas.
- **In-place identity reuse could hide an update.** D7 mints a new object whenever facts change
  precisely to avoid this, but if any consumer uses `React.memo` with a node-identity comparator
  it would go stale. Audit for custom comparators during commit 3.
- **Client-supplied Person uuids change an RPC's trust surface.** Not a security change — RLS
  still governs whether the insert is permitted, and a colliding uuid fails on the primary key
  — but it is a signature change to a `SECURITY DEFINER` function and belongs in (B)'s review,
  not LIN-58's. **Shipped in LIN-64** as `p_new_node_id uuid DEFAULT NULL`; a collision arrives as
  `TreeRecordError('conflict')`. Nothing sends it yet, so LIN-58's callers are the first.
- **`is_within_1_degree` cannot work against the schema as declared, and LIN-64 deliberately did
  not fix it.** `20260817140000_lin59...` compares `public.users.id` to text while `is_admin()`
  compares it to `uuid`; both cannot hold, so one of the two raises on every call. The live
  definitions may have been hand-edited. This gates every non-admin write, so establish which
  before relying on optimism for non-admin users — see ADR-0010's last consequence.
