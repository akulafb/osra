# 0009 One Owner of the Graph in Memory

We decided to make the browser's copy of the Tree Record a single provider-owned value
(`src/contexts/FamilyDataContext.tsx`) rather than a hook each consumer may instantiate.

**Issue**: [LIN-63](https://linear.app/linearfb/issue/LIN-63) — Arch 06a, split out of
[LIN-58](https://linear.app/linearfb/issue/LIN-58) as the one user-visible *bug* in its evidence
(`docs/plans/2026-08-26-lin-58-working-record-spec.md`, D1). It blocks LIN-58.

## Context & Problem

`useFamilyData` fetched Persons, Kinship Links and the claimed-node ids — three requests — and
two components called it: `FamilyTree`, and `FamilyChat` through `useFamilyChat`. `FamilyChat`
mounts unconditionally, so every page load made **six** requests and held **two independent
copies** of the same family tree.

Only one of those copies was ever refetched. The chat's copy re-read on `[session, user]` and
nothing else, so a Person Spawned after load stayed invisible to every answer the LLM gave for
the rest of the session — while being visible on the canvas the user was looking at.

Measured in the browser at `?dev=true` (React StrictMode doubles each mount, so halve for
production):

| | Requests to `/rest/v1/` on load | Chat context after Spawning "Zaynab" |
|---|---|---|
| Before | 12 (`nodes` 4, `links` 4, `rpc/get_claimed_node_ids` 4) | 6 Persons — no Zaynab |
| After | 6 (`nodes` 2, `links` 2, `rpc/get_claimed_node_ids` 2) | 7 Persons — Zaynab, with her Kinship Link to Fahd |

## Decision

1. **The owner is a provider.** `FamilyDataProvider` holds the state, runs the fetch, and owns
   `carryPositions`. It is mounted around `<FamilyTree />` in `HomePage` — the narrowest scope
   that covers every reader, and one that leaves the landing page holding no graph at all.
2. **`useFamilyData()` is now a consumer**, returning the same
   `{ graphData, isLoading, error, refetch }` shape. Call sites are unchanged, and a *reader* can
   no longer mint a rival copy: there is nothing to call but the consumer, and it fetches nothing.
   Used outside the provider it throws, because the symptom of a missing provider (a tree that
   renders nothing) is indistinguishable from an empty family.

   The precise limit of what this enforces: nesting a second `<FamilyDataProvider>` inside the
   first would still fetch again and shadow the owner for its subtree, silently. That is a
   deliberate act at a mount point, not the accidental second `useFamilyData()` call that caused
   this bug, and it is visible in the one place providers are mounted — so it is left unguarded.
3. **No vocabulary change.** The names `useFamilyData` / `graphData` stay as they are, and the
   new identifiers (`FamilyDataContext`, `FamilyDataProvider`) are named to match them rather
   than to introduce a third vocabulary alongside them. `CONTEXT.md` documents the browser-held
   set as the **Working Record**, and that is the name this should eventually carry — but
   `useWorkingRecord` is already reserved by LIN-58's spec for a *different* contract
   (`working`, `confirmedLinks`, `write`, `reload`), so taking the name now would collide with
   it, and renaming only the file and provider would leave two vocabularies inside one module.
   One rename, in the commit that changes the shape.

   **LIN-58 did that rename.** `FamilyDataContext` is `src/contexts/WorkingRecordContext.tsx`,
   `FamilyDataProvider` is `WorkingRecordProvider`, `useFamilyData()` is `useWorkingRecord()`,
   and `graphData` is `working`. Every name in this ADR below this line is the one it had then.

## Considered and Rejected

- **Prop-drill the graph into `<FamilyChat graphData={…} />` and `useFamilyChat(graph)`.** One
  prop, no new file, and it matches how `FamilyTree` feeds the 2D/3D views. Rejected because it
  removes today's second copy without preventing tomorrow's: the fence is a convention, and the
  bug it guards against already shipped once. LIN-58 also adds four more readers of this state
  (the modals that currently take `onSuccess={refetch}`), which is the shape a provider serves
  and prop-drilling does not.
- **A dev-only "more than one owner" assertion inside the hook.** Rejected: with the fetch behind
  a provider, the only way to get a second owner is to mount a second provider, and a
  module-level counter that notices that at runtime, in dev, buys little over reading the one
  file where providers are mounted. It is also untestable in this repo's harness.
- **A cache library (React Query, SWR, Zustand).** Rejected for the reason LIN-58 records in D3:
  the precious state is mutable simulation state living on the node objects themselves, and
  replacing those objects is a cache library's core competence and our core hazard.
- **Fetching the chat's context separately but subscribing it to writes.** Rejected: that is two
  copies plus a synchronisation problem, which is strictly worse than one copy.

## Consequences

- Page load drops from six requests to three. Not the point, but it is the measurable part.
- The chat answers from the same Persons and Kinship Links the canvas draws, at send time,
  because it reads the owner's array by reference — including anything a refetch has picked up.
- Component and hook behaviour still has no test harness (`environment: 'node'`,
  `include: ['src/**/*.test.ts']` — `vite.config.ts:52-55`), so both claims above are verified in
  the browser rather than in CI. The gap is recorded in
  `docs/plans/2026-08-17-architecture-review.md` under "Not candidates — deliberately".
- LIN-58 now has one seam to replace instead of two call sites to keep in step: the provider's
  internals become `useWorkingRecord`, and `write` reaches the modals through the same context.
- `carryPositions` (`:59-109`) is pure and therefore the one part of this module the `.test.ts`
  harness could reach if it lived in `src/lib/`. It stays where it is: LIN-58's D7 folds it into
  `projectWorkingRecord`, narrowing it from every node on every fetch to the one node that
  changed, so a module and a test suite extracted now would be rewritten by the next ticket.
