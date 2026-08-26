# Architecture review — 2026-08-17

Survey output from `/improve-codebase-architecture`. Six **deepening opportunities**, ranked. Each candidate is an *idea*, not a ticket: pick one, take it into `/grill-with-docs`, and let that produce the spec.

Vocabulary is `/codebase-design` (module, interface, implementation, depth, seam, adapter, leverage, locality) for architecture, and [`CONTEXT.md`](../../CONTEXT.md) (Tree Record, Person, Tree Node, Kinship Link, Relative Direction, Action Handle, Ghost Node, Connect Mode, Ghost Preview, Spawn, Dissolve) for the domain.

**Tracker**: LIN-53 … LIN-58 (see each candidate). **Candidates 01–05 are done** — 01/LIN-53 (see [Outcome: candidate 01](#outcome-candidate-01--shipped) at the end of this file), 02/LIN-54 ([ADR-0004 direct-manipulation](../adr/0004-direct-manipulation-state-machine.md)), 03/LIN-55 ([ADR-0007](../adr/0007-one-lifecycle-one-clock.md)), 04/LIN-56 ([ADR-0006](../adr/0006-live-graph-endpoints-and-traversal.md)), 05/LIN-57 ([ADR-0005](../adr/0005-person-match-resolution.md)). Only **candidate 06 / LIN-58** remains open.

## Scope

Scoped to the hot spots in the last 40 commits — `FamilyTree3D.tsx` (11 touches), `FamilyTree.tsx` (8), `FamilyTree2D.tsx` (7) — plus the mutation path underneath all three. `CONTEXT.md`, ADR-0001 and ADR-0002 were read first.

## Baseline numbers

| | |
|---|---|
| Database write paths | **13**, across 3 unrelated modules |
| Props at the view seam | **61** (3D) / **42** (2D) |
| Tests touching any write path | **0** of 163 cases |
| Genuinely deep modules found | **3** (the 3D hooks — leave them alone) |

## Ordering

```
01 ──┬── 02
     ├── 03 ──┬── 06
     │        │
     └────────┘
04, 05  (independent, grab anytime)
```

- **02, 03** are blocked on **01**: both need a substitutable write module to test against.
- **06** is blocked on **01** and **03**.
- **04, 05** have no blockers.

> **Citations go stale.** Every `file:line` below is a pointer to re-verify, not a fact — candidate 01 will move most of them. If you pick up a later candidate long after 01 lands, re-run `/improve-codebase-architecture` rather than trusting this file. What this file preserves that a re-run cannot is *which candidates were considered*; what an ADR preserves is *which were rejected and why*.

---

## 01 — Give the Tree Record a write module

**Strong** · ports & adapters · `LIN-53` · **DONE** — shipped as `src/lib/treeRecord.ts`, see the Outcome section below

**Files** — `src/lib/familyMutations.ts`, `src/lib/adminSupabaseRest.ts`, `src/lib/permissions.ts`, `src/components/FamilyTree.tsx:229–351`, `src/components/modals/{AddRelative,EditNode,BulkInvite}Modal.tsx`, `src/pages/InvitePage.tsx:151`

**Problem** — The same write is implemented three times, so the fork between admin and non-admin, and the authorization check, sit at call sites instead of behind an interface.

**Solution** — One module owning every write to `nodes`, `links` and `node_invites`. It decides admin routing internally and takes the caller's identity, not a caller-supplied `isAdmin` boolean.

### Evidence

Zero writes go through the Supabase JS client — `src/lib/supabase.ts` is imported only by `AuthContext.tsx` for auth. Every data operation is a hand-rolled `fetch` against `/rest/v1/`.

| # | Site | Target | Via a module? |
|---|---|---|---|
| 1 | `familyMutations.ts:31` | `rpc/create_relative_secure` | is the module |
| 2 | `familyMutations.ts:64` | `rpc/link_existing_relative_secure` | is the module |
| 3 | `adminSupabaseRest.ts:42` | `rpc/admin_delete_node_secure` | separate module |
| 4–7 | `adminSupabaseRest.ts:80,109,135,155` | `nodes`, `links` ×3 | separate module |
| 8 | `AddRelativeModal.tsx:111` | `rpc/link_existing_relative_secure` | **bypasses — duplicate of #2** |
| 9 | `AddRelativeModal.tsx:143` | `rpc/create_relative_secure` | **bypasses — duplicate of #1** |
| 10 | `EditNodeModal.tsx:99` | `PATCH /nodes` | **bypasses — sole writer of node updates** |
| 11–12 | `BulkInviteModal.tsx:193,218` | `node_invites` | **bypasses** |
| 13 | `InvitePage.tsx:151` | `rpc/claim_invite_secure` | **bypasses** |

`nodes` is written from 5 places, `links` from 7. The `supabaseUrl`/`supabaseKey`/`authToken` triple is re-derived from `import.meta.env` in **10 files**.

**A live defect the missing seam is already producing** — `FamilyTree.tsx:333–334`:

```ts
const relType: RelativeDirection =
  params.type === 'parent' ? 'parent' : params.type === 'marriage' ? 'spouse' : 'child';
```

The admin/non-admin fork lives in a React callback. For a non-admin, `'divorce'` falls through to `'child'` — Connect Mode's divorce option silently writes a parent link.

**Duplicated request bodies** — `familyMutations.ts:38–44` and `AddRelativeModal.tsx:150–156` build the identical RPC body, differing only in error text and where the 200-char trim happens. `AddRelativeModal.tsx:18` declares its own `RelationshipType` including `'sibling'` and posts it straight through, which `RelativeDirection` (`graph.ts:30`) forbids.

**Permissions belong at this same seam**

- `permissions.ts:16 canEdit` is never called on a write path — all 8 call sites gate a render.
- `requireAdmin` (`adminSupabaseRest.ts:3`) checks a boolean the caller passed in. It is a UI assertion, not a check.
- `canCreateLink` (`permissions.ts:228`) has **zero call sites**. Connect Mode does structural validation (`validateProposedLink`) and no authorization check at all.
- `isAdmin` is derived four ways: `AuthContext.tsx:170`, then recomputed inline at `FamilyTree.tsx:85`, `:643`, and `PersonDetailDrawer.tsx:51`.
- The admin bypass is defeated at the call site: `permissions.ts:23` says `if (isAdmin) return true`, but `FamilyTree.tsx:84` guards the whole call on `userProfile?.node_id`. An admin with a null `node_id` gets 2D Action Handles (`FamilyTree2D.tsx:500`, unguarded) but not the 3D panel. The two renderings disagree because each re-derives the answer.

**Wins** — locality: routing bug fixable once · leverage: 13 call sites, 1 interface · the interface becomes the test surface · `canEdit` gates writes, not renders · deletes 10 env re-derivations.

---

## 02 — Put the direct-manipulation state machine behind one interface

**Strong** · in-process · `LIN-54` · blocked by `LIN-53`

**Files** — `src/components/FamilyTree.tsx` (762), `FamilyTree2D.tsx` (1042), `FamilyTree3D.tsx` (2211), `NodeCard.tsx:66`

**Problem** — Selection, Ghost Node, Connect Mode and Dissolve confirmation are written twice with different types, and the props list is the union of both implementations' internals — so no one can change one rendering without reading the other.

**Solution** — One module owns the state machine and exposes what each rendering must draw. The renderings keep their own chrome, camera and geometry.

> **Bounded by ADR-0002.** The ADR deliberately diverges the 2D and 3D *interaction models* — directional Action Handles vs a docked panel — and that divergence must survive. The seam goes **behind** the renderings, not through them: what unifies is the state machine (which Tree Node is the connect source, is a Ghost Node open, is a Dissolve awaiting confirmation), not how it is drawn. This does not reopen ADR-0002.

### Evidence — five leaks across the current seam

- **Escape precedence duplicated 3×** — `FamilyTree2D.tsx:294` (keydown), `:433` (background click), and `ConnectPickerCard.tsx:54` (a third window listener whose `stopPropagation` cannot reach its sibling). All encode the same four-level fallthrough.
- **Two connect modes** — the inline one at `FamilyTree2D.tsx:179–181` and an admin one at `FamilyTree.tsx:56–59` that the 2D rendering knows nothing about.
- **Selection split three ways** — parent holds it (`FamilyTree.tsx:44`), the child intercepts clicks first (`FamilyTree2D.tsx:453`), the parent intercepts again for admin connect (`:134`).
- **Delete confirmation lives in a leaf card** — `NodeCard.tsx:66` holds `isConfirmingDissolve` and auto-cancels it on a hover heuristic (`:69–73`).
- **`onAddRelative` drops its argument** — declared with `relation` (`FamilyTree2D.tsx:86`), the parent's handler ignores it (`FamilyTree.tsx:207`) because the real value never left the child.

Concepts held in both with different types: `connectPair` (`FamilyTree2D.tsx:181` as `{source,target}: Node2D` vs `FamilyTree3D.tsx:340` as `ConnectPair` of `FamilyNode`), `activePreset`, `showControls`.

Dead across the seam: `onStartConnect` (`FamilyTree2D.tsx:87`, never passed), `onStartDissolve` (`NodeCard.tsx:21`, unreachable), `(FamilyTree2D as any).focusNode` (`:427`, read by nobody). `React.memo` is applied at `FamilyTree2D.tsx:1042`, `NodeCard.tsx:525` and `OrthogonalLinks.tsx:58` but every consumer imports the unmemoized named export — so every `NodeCard` re-renders on every pan.

**Wins** — interface: 61 props → a handful · locality: one Escape precedence · leverage: 2 renderings, 1 machine · state machine testable without a DOM.

---

## 03 — Make Spawn and Dissolve one lifecycle with one clock

**Strong** · in-process · `LIN-55` · blocked by `LIN-53`

**Files** — `src/components/FamilyTree.tsx:212–226, 278–308`, `NodeCard.tsx:66–103`, `FamilyTree2D.tsx:703–717`, `ParticleDissolve.tsx`, `SpawnBurst.tsx`, `hooks/useCosmicFx.ts`

**Problem** — `CONTEXT.md` and ADR-0002 both say Spawn and Dissolve are one lifecycle rendered two ways. In the code the lifecycle is four fragments on three disagreeing clocks, and its documented rollback is a flag.

**Solution** — One module per lifecycle owning phase, clock and rollback, with the two renderings as adapters behind it — the split `CONTEXT.md` already names.

### Evidence

Three clocks for one Dissolve:

| Clock | Duration | Where |
|---|---|---|
| `cardDissolve` CSS | 450 ms | `NodeCard.tsx:101` |
| particle sim | ~1000 ms | `ParticleDissolve.tsx:56–72` |
| release timer | 1600 ms | `FamilyTree.tsx:286` (`COSMIC_FX_DURATION_MS.collapse + 500`) |

- **The completion signal is unreachable.** `ParticleDissolve` is rendered by iterating the *post-refetch* `nodes` (`FamilyTree2D.tsx:703–717`). Once the refetch lands the node is gone, so it unmounts before its particles expire and `onComplete` never fires. `FamilyTree.tsx:750` is dead; the 1600 ms timer is the real releaser — while the comment at `:283–285` asserts the opposite.
- **Rollback races its own timer.** `FamilyTree.tsx:303` sets `dissolvingNodeId` to null on error, but `:286` already scheduled the same thing. Either way it only cancels an animation flag; no graph state is restored.
- **`SpawnBurst.onComplete` is never passed** (`FamilyTree2D.tsx:690`). The 3500 ms timer at `FamilyTree.tsx:246` is the only releaser.
- **Two unrelated delete paths reach one endpoint** — the in-tree Dissolve, and `PersonDetailDrawer` → `handleAdminDeleteSelectedNode` (`FamilyTree.tsx:156`) with a native `window.confirm` and no animation at all.
- **The 2D delete affordance is not permission-gated.** `FamilyTree2D.tsx:677` gates the handle on `canEdit` (1-degree relatives) but `FamilyTree.tsx:280` bails on `!isAdmin`. A non-admin 1-degree relative sees the handle, sees the shake, clicks ✓, and nothing happens — no error, no feedback. 3D passes `canDissolveSelected={isAdmin && canEditSelected}` (`:707`); 2D gets no equivalent.

**Leave the 3D hooks alone.** `useCosmicFx` (223 L), `useGhostPreview` (182 L) and `useClusterBubbles` (419 L) are already deep — 823 lines of rAF loops, raycasting and Three.js disposal behind three signatures, two returning `void`. They own their own `scene.add`/`dispose` lifecycles correctly. The friction is above them.

**Wins** — locality: one clock, one owner · dead `onComplete` path removed · phase machine testable, no DOM · domain language reaches the code.

---

## 04 — Make the live graph a module, not a shape you defend against

**Worth exploring** · in-process · `LIN-56` · no blockers

**Files** — `src/types/graph.ts:3–46`, `src/utils/getNodeId.ts`, `src/lib/permissions.ts:52`, `src/utils/familyContext.ts:24`, `FamilyTree3D.tsx`, `BulkInviteModal.tsx`

**Problem** — `FamilyLink.source` is typed `string`, but d3-force rewrites it to a node object in place. Every reader defends itself, and three of the copies drop to `any`.

**Solution** — Type the endpoints as unknown-until-resolved and make the accessor the only way to read them.

### Evidence — one canonical helper, four re-implementations

| Implementation | Note |
|---|---|
| `utils/getNodeId.ts:4` | canonical, null-safe; used by `filterGraphData`, `adminGraphValidation`, `AdminManageLinksModal` |
| `permissions.ts:52 getSafeId` | byte-equivalent copy, `any`-typed |
| `familyContext.ts:24 getId` | third copy, one line |
| `FamilyTree3D.tsx:861,947,948,973,974,1599` | inlined with `as any` |
| `BulkInviteModal.tsx:73–114` | inlined **ten times** in one file |

Four parallel shapes for one thing: DB row (`database.ts:42`), domain `FamilyNode`/`FamilyLink` (`graph.ts:3`), `Node2D`/`Link2D` whose endpoints are *objects* (`graph.ts:33`), and the force-graph runtime shape that `LiveNodePosition` (`forceGraph.ts:26`) describes but is never used as.

Related: `parentRole` is `null` in the DB, converted to `undefined` at `useFamilyData.ts:118` (that file is `src/contexts/FamilyDataContext.tsx` since LIN-63; line citations here are as of 2026-08-17), and papered over at `adminGraphValidation.ts:43` with `(a.parentRole ?? null) === (b.parentRole ?? null)`. `FamilyLink.id` is optional (`graph.ts:17`) because `filterGraphData.ts:71` pushes synthetic parent links without one — which then appear in Manage Links as permanently un-editable rows.

**Wins** — deletes ~20 inline re-reads · 3 `any` escapes removed from the security-relevant module · locality: one place d3 leaks.

---

## 05 — One module for duplicate-Person matching

**Worth exploring** · in-process · `LIN-57` · no blockers

**Files** — `src/components/cards/ghostNodeCandidates.ts:16`, `modals/AddRelativeModal.tsx:63`, `modals/EditNodeModal.tsx:47`

**Problem** — "Is this Person already in the tree?" is a domain question with three inconsistent answers, and the strictest one guards the path ADR-0001 demoted.

**Solution** — One module answering the question and returning the resolution the caller must make (`none` / `candidates` / `must-confirm`), so the guard travels with the answer.

### Evidence

| Implementation | Min chars | Matches on | Cap | Sorted | Blocks submit |
|---|---|---|---|---|---|
| `ghostNodeCandidates.ts:16` *(inline, 2D+3D)* | 2 | full haystack | 4 | no | **no** |
| `AddRelativeModal.tsx:63` | 3 | full haystack | none | yes | **yes** |
| `EditNodeModal.tsx:47` | 3 | `firstName` only | none | no | n/a |

`AddRelativeModal.tsx:175–178` blocks submit until the user resolves a duplicate. `GhostNodeCard.tsx:61–74` has no equivalent guard — so the primary path ADR-0001 chose creates duplicate Persons with no confirmation, and the fallback path is the one that's safe.

Separately, the candidate pool is wrong on the primary path: `FamilyTree2D.tsx:724` passes the *unfiltered* graph, so picking a match in a hidden cluster writes a Kinship Link the user never sees appear.

**Wins** — locality: one threshold to tune · guard reaches the primary path · the existing 8 tests in `ghostNodeCandidates.test.ts` come to cover all callers · smallest candidate here.

---

## 06 — A graph store that can be updated, not only refetched

**Speculative** · local-substitutable · `LIN-58` · blocked by `LIN-53`, `LIN-55`

> **Re-verified 2026-08-26 — two of the five evidence bullets below are now false.** LIN-55 fixed
> the destroyed pins (`carryPositions`) and the mid-animation recentre. The blockers (LIN-53,
> LIN-55) have both landed. See [`2026-08-26-lin-58-working-record-spec.md`](./2026-08-26-lin-58-working-record-spec.md)
> for the current evidence and [ADR-0008](../adr/0008-working-record-representation.md) for the decision.
>
> **A third bullet is now closed.** LIN-63 landed the single owner: the graph lives in
> `src/contexts/FamilyDataContext.tsx` and the chat reads it instead of fetching its own copy
> ([ADR-0009](../adr/0009-one-owner-of-the-graph-in-memory.md)). What remains of 06 is optimism.

**Files** — `src/contexts/FamilyDataContext.tsx` (was `src/hooks/useFamilyData.ts:22–167`), `FamilyTree.tsx` (11 refetch sites)

**Problem** — Every write is `await write; await refetch()` — a full re-download of every Person and Kinship Link plus the claimed-ids RPC. There is no optimistic update anywhere in the codebase.

**Solution** — A store whose interface is add / update / remove plus reconcile, so a write touches one Person instead of replacing the graph.

### Evidence

- `refetch()` fires from 11 sites: `FamilyTree.tsx:171,241,268,296,343,474,583,591,607,620,632`.
- The Spawn animation waits on three network round-trips before it can start (`FamilyTree.tsx:241` then `:245`).
- **Pinned positions are destroyed.** `FamilyTree3D.tsx:988–999` and `:1095–1111` write `fx/fy/fz` onto the node objects held in React state, in place. `useFamilyData.ts:130` shallow-clones *links* to survive exactly this problem — nodes get no such treatment, so `:158` replaces them and every pin is silently discarded. *(LIN-55 fixed this with `carryPositions`; `useFamilyData.ts` is `src/contexts/FamilyDataContext.tsx` since LIN-63, where the clone is `:220`.)*
- **The 2D viewport recentres mid-animation.** `FamilyTree2D.tsx:237–261` depends on `bounds`, rebuilt on every refetch. The comment claims "only re-center on initial load"; the dep array `[bounds, nodes.length === 0]` does not implement that.
- **Two copies of the graph.** ~~`useFamilyChat.ts:16` calls `useFamilyData()` a second time, and `FamilyChat` mounts unconditionally at `FamilyTree.tsx:757`. The chat copy has no `refetch` wiring and goes stale on the first write.~~ **Closed by LIN-63** — one provider owns the graph, six requests per load became three, and the chat answers from the Persons on the canvas.

**Why speculative** — largest change here, depends on 01 and 03 landing first, and its payoff is partly performance, which nobody has complained about.

**Wins** — real rollback, not a flag · pinned positions survive writes · one graph in memory, not two.

---

## Not candidates — deliberately

- **The three 3D hooks are deep. Leave them.** See 03.
- **Test harness gap, noted not proposed.** `vite.config.ts:52–55` sets `environment: 'node'` and `include: ['src/**/*.test.ts']` — no DOM, and a `.test.tsx` would not even be collected. That's why 163 test cases render zero components. Candidates 01–03 are all chosen so their payoff lands *inside* this constraint rather than requiring it be lifted.
- **`layoutEngine.ts`** — 643 lines of pure, DOM-free functions with zero tests. Not an architecture problem; just missing tests. Worth a ticket, not a deepening.

---

## Outcome: candidate 01 — shipped

LIN-53 landed as `src/lib/treeRecord.ts` (+ `treeRecord.test.ts`). `familyMutations.ts` and `adminSupabaseRest.ts` are deleted. Recorded here so the survey above stays readable as a *before* picture rather than silently going stale.

**The eight write paths that were consolidated:**

1. `createRelativeSecure` (`familyMutations.ts`) — RPC `create_relative_secure`
2. `linkExistingRelativeSecure` (`familyMutations.ts`) — RPC `link_existing_relative_secure`
3. `adminInsertNode` (`adminSupabaseRest.ts`) — REST `POST /nodes`
4. `adminInsertLink` (`adminSupabaseRest.ts`) — REST `POST /links`
5. `adminPatchLink` (`adminSupabaseRest.ts`) — REST `PATCH /links`
6. `adminDeleteLink` (`adminSupabaseRest.ts`) — REST `DELETE /links`
7. `adminDeleteNode` (`adminSupabaseRest.ts`) — RPC `admin_delete_node_secure`
8. Inline `fetch(PATCH /nodes)` (`EditNodeModal.tsx`)

**Into six operations** — `addPerson`, `addLink`, `editPerson`, `editLink`, `removePerson`, `removeLink` — constructed via `createTreeRecord(identity, config)`, with `relativeToKinshipLink()` as the single conversion point from Relative Direction to Kinship Link, and `TreeRecordError` carrying `kind: 'refused' | 'not-authorized' | 'network' | 'conflict' | 'unknown'`.

**The Connect Mode defect is closed.** A non-admin picking `divorce` fell through to `'child'` at `FamilyTree.tsx:333` and quietly wrote a parent link. It is now refused with `TreeRecordError('refused')` and disabled up front in `ConnectPickerCard`. Full decisions in [`docs/adr/0003-tree-record-write-seam.md`](../adr/0003-tree-record-write-seam.md).

**Spin-offs filed from this work:**

- **LIN-59** — four write paths are not admin-gated server-side; `isAdmin` is a client boolean with no DB backstop
- **LIN-60** — invite tokens enumerable with the publishable anon key; `claim_invite_secure` never checks expiry
- **LIN-61** — *answered:* recording a divorce is admin-only, by decision rather than by accident

**One correction to the survey above.** Candidate 04 cites the `RelativeDirection` / `'sibling'` mismatch as a defect. On closer reading it isn't: `create_relative_secure` genuinely handles `sibling` (`20260406120000_lin22_first_name.sql:161`, with its own "target has no parents to branch from" guard). The incomplete thing is the TypeScript type at `graph.ts:30`, which omits it — `treeRecord.ts:35` widens it inline with `RelativeDirection | 'sibling'`. The tidier fix is to add `'sibling'` to the type itself. Minor, and folded into candidate 04's scope.
