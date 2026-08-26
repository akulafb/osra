# LIN-57 — One module for duplicate-Person matching

**Status**: spec, awaiting implementation
**Issue**: [LIN-57](https://linear.app/linearfb/issue/LIN-57) — Arch 05, from `docs/plans/2026-08-17-architecture-review.md`
**Branch**: `akulafb/lin-57-arch-05-one-module-for-duplicate-person-matching`

Produced by grilling the issue. Every decision below was put to the maintainer and answered;
the rationale is recorded because several of them deliberately change existing behaviour.

## Problem

"Is this Person already in the Tree Record?" has three inconsistent answers today, and the
strictest one guards the path ADR-0001 demoted.

| Implementation | Min chars | Matches on | Cap | Sorted | Blocks submit |
|---|---|---|---|---|---|
| `cards/ghostNodeCandidates.ts:16` (Ghost Node, 2D + 3D) | 2 | full haystack | 4 | no | no |
| `modals/AddRelativeModal.tsx:63` | 3 | full haystack | none | yes | yes |
| `modals/EditNodeModal.tsx:47` | 3 | `firstName` only | none | no | n/a |

Three findings from re-verification that the issue did not record:

1. **Both views have the pool bug, not just 2D.** All five call sites pass the unfiltered
   `graphData.nodes`. `FamilyTree2D.tsx:670` does it while rendering from `filterGraphData`
   (`:183`); `FamilyTree3D.tsx:2126` does the same. Collapsed subtrees hide people too, not
   only cluster presets.
2. **`AddRelativeModal`'s guard is not a duplicate guard.** `hasDuplicateConflict` is
   `candidates.length > 0` (`:74`) over a substring match on the whole haystack (`:67-72`),
   so typing "Bad" blocks submit against everyone in the Badran cluster.
3. **`EditNodeModal` asks a different question** — rename collision, not existence — and its
   answer is advisory.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | All three callers use one module, with an `intent` distinguishing creation from renaming | The *matching* is one question; only the resolution differs. `EditNodeModal` currently gets a worse answer (misses cluster matches entirely). |
| D2 | Minimum query length is **2** everywhere | A noisy dropdown is ignorable; a missed duplicate is permanent. Keeps the eight existing tests honest. |
| D3 | `must-confirm` fires only on an **exact, case-insensitive given-name match**; everything else is advisory | "Ahmad" when an Ahmad exists is a real question. "Bad" against the Badran cluster is not, and blocking on it is why today's guard reads as an obstacle. |
| D4 | Pool is the **whole Tree Record**; the module marks each match as visible or not | Narrowing the pool to the filtered graph would *create* duplicates whenever a filter is on. The invisible-link bug becomes a labelling problem, not a matching one. |
| D5 | Module always sorts (exact first, then alphabetical) and caps at 4, reporting the total | Sorting is domain logic. The cap is presentation, but 4 suits every caller, and the total lets a 190px card stay honest about what it hides. |
| D6 | Lives at `src/lib/personMatch.ts`. Glossary terms: **Person Match**, **Match Resolution** | It is a domain question and belongs beside `treeRecord`, `permissions`, `filterGraphData`. "Duplicate" is the wrong root word: we do not know it is a duplicate — that is what we are asking. |
| D7 | The Ghost Node **hard-blocks** on `must-confirm`, same as the modal | Chosen over two-step Enter: less state, no mode, and both creation paths feel identical. Knowingly trades against ADR-0001's "instant creation with Enter" claim — see Risks. |
| D8 | `EditNodeModal` **blocks Save** until the user confirms "different person" | If one caller may ignore the resolution, policy is back at the call site, which is the failure this module exists to end. Behaviour change on a path nobody complained about; accepted deliberately. |
| D9 | Cluster disagreement does **not** weaken the trigger | At Ghost Node time the new Person has no cluster — it is derived server-side after creation — so a cluster-aware rule would guess exactly where it matters most. |
| D10 | Already-linked people are **marked, never excluded**; matching stays about names | "Ahmad, already your parent" is a more useful answer than silence, and it tells a confused user why their duplicate is not appearing. |

## Module contract

```ts
// src/lib/personMatch.ts

export const MIN_MATCH_QUERY_LENGTH = 2;
export const MATCH_CANDIDATE_LIMIT = 4;

/** Creation asks "does this Person exist?"; renaming asks "am I colliding with one?" */
export type MatchIntent = 'creating' | 'renaming';

/** An existing Person who might be the one being described, and why we think so. */
export interface PersonMatch {
  person: FamilyNode;
  /** The query is exactly this Person's given name, trimmed and case-folded. */
  isExactGivenName: boolean;
  /** False when hidden by a cluster preset or a collapsed subtree. Labelling only. */
  isVisible: boolean;
  /** Already has a Kinship Link to the anchor. Marking only — never excluded (D10). */
  isAlreadyConnected: boolean;
}

/** What the caller must do about the matches. */
export type MatchResolution =
  | { kind: 'none' }
  | { kind: 'candidates'; matches: PersonMatch[]; totalMatchCount: number }
  | { kind: 'must-confirm'; matches: PersonMatch[]; totalMatchCount: number };

export interface MatchExistingPersonsParams {
  query: string;
  intent: MatchIntent;
  /** The whole Tree Record, unfiltered (D4). */
  pool: FamilyNode[];
  /** Anchor Person when creating, the Person being edited when renaming. */
  excludePersonId: string;
  /** Ids currently drawn. Omit to treat everything as visible. */
  visibleIds?: ReadonlySet<string>;
  /** Ids already linked to the anchor. Omit to mark nothing. */
  connectedIds?: ReadonlySet<string>;
  /** `renaming` only: the Person's current given name; an unchanged name resolves to `none`. */
  currentGivenName?: string;
  limit?: number;
}

export function matchExistingPersons(params: MatchExistingPersonsParams): MatchResolution;
```

### Rules

- Query is trimmed and case-folded. Below `MIN_MATCH_QUERY_LENGTH` → `none`.
- `intent: 'renaming'` with a query equal to `currentGivenName` (trimmed, case-folded) → `none`.
  This preserves `EditNodeModal.tsx:48`'s existing skip. Without it, opening Edit on an Ahmad
  who shares a name with another Ahmad would block on a field the user never touched.
- Matching is a substring test against `nodeSearchHaystack` — given name plus both clusters —
  for every intent. This is a widening for `EditNodeModal`, which is `firstName`-only today.
- `excludePersonId` is never a match.
- Sort: exact given-name matches first, then `localeCompare` on given name. Visibility and
  connectedness do not affect order.
- `totalMatchCount` counts matches before the cap; `matches` is capped at `limit ?? MATCH_CANDIDATE_LIMIT`.
- Resolution is `must-confirm` when at least one match (**before** the cap) is an exact given-name
  match; `candidates` when there are matches but no exact one; `none` when there are none.

## Caller behaviour

### Ghost Node — `cards/GhostNodeCard.tsx` (primary path, 2D + 3D)

- `intent: 'creating'`, `excludePersonId` = anchor.
- `candidates` → today's dropdown, unchanged.
- `must-confirm` → the ↵ button is **disabled** and carries a `title` stating why
  ("Someone here is already called Ahmad — pick them, or confirm this is a different person").
  A refusal the user cannot see the reason for is the failure mode D7 has to avoid.
- The dropdown header gains a **"Different person"** control. Clicking it re-enables ↵ and
  submits as a new Person. Resets whenever the typed name changes.
- Matches with `isVisible: false` render a "hidden by filter" label.
- Matches with `isAlreadyConnected: true` render disabled, labelled "already connected".

### `modals/AddRelativeModal.tsx`

- `intent: 'creating'`, `excludePersonId` = `targetNode.id`.
- The inline filter, `sortDuplicateCandidates`, and `hasDuplicateConflict` are deleted; the
  submit guard at `:175-178` keys off `kind === 'must-confirm'` instead of `length > 0`.
  Net effect: the guard fires far less often and means something when it does (D3).
- `confirmedDifferentPerson` / `selectedExistingId` state and its error string are unchanged.
- Gains the hidden and already-connected labelling.

### `modals/EditNodeModal.tsx`

- `intent: 'renaming'`, `excludePersonId` = `targetNode.id`, `currentGivenName` = `targetNode.firstName`.
- `candidates` → today's passive warning list.
- `must-confirm` → Save is blocked behind a single "different person" confirm (D8). No connect
  option: the Person already exists, so there is nothing to merge into.
- `connectedIds` is not passed — there is no connect action to guard.

### Wiring the two new sets

- `visibleIds`: 2D from the `filterGraphData` memo at `FamilyTree2D.tsx:183`; 3D from the
  `filterGraphDataFor3D` result at `FamilyTree.tsx:335`; both modals from the filtered memo at
  `FamilyTree.tsx:342`. All are `new Set(nodes.map(n => n.id))`.
- `connectedIds`: derived from `graphData.links` — every id sharing a link with the anchor,
  via `getNodeId` on both endpoints.

## Tests

`src/lib/personMatch.test.ts`, seeded from the eight cases in `ghostNodeCandidates.test.ts`
(which is deleted with its module). New cases:

- exact given name → `must-confirm`; substring only → `candidates`; nothing → `none`
- exactness is case- and whitespace-insensitive
- an exact match *past* the cap still produces `must-confirm`
- `totalMatchCount` reports the uncapped total
- sort puts the exact match first, then alphabetical
- `isVisible` false for ids absent from `visibleIds`; all true when the set is omitted
- `isAlreadyConnected` marks without excluding
- `renaming` with an unchanged name → `none`; with a changed colliding name → `must-confirm`
- `renaming` matches on cluster, not just given name (the widening)

## Commits

1. `src/lib/personMatch.ts` + tests. No caller touched.
2. Five call sites converted; `ghostNodeCandidates.{ts,test.ts}` deleted. All behaviour
   changes (D3, D7, D8, D10) land here.
3. `CONTEXT.md` terms + `docs/adr/0005-person-match-resolution.md`.

## Docs

**`CONTEXT.md`** gains, under Core Entities:

- **Person Match** — an existing Person who might be the one currently being described, together
  with why we think so: whether the given name matches exactly, whether they are currently drawn,
  and whether they are already linked to the anchor. _Avoid_: Duplicate, Suggestion, Autocomplete result.
- **Match Resolution** — what a Person Match obliges the caller to do: nothing, offer the matches,
  or require the user to resolve before writing. _Avoid_: Validation, Conflict, Duplicate check.

**ADR-0005** records D3 (exact-name-only trigger, a deliberate loosening) and D4 (whole-record
pool with visibility marking, chosen over the obvious "filter the pool"), plus D7's trade against
ADR-0001. Note: `docs/adr/` already contains **two files numbered 0004**
(`0004-direct-manipulation-state-machine.md`, `0004-server-side-write-authorization.md`).
Pre-existing on `main`; renumbering is deliberately left to a separate housekeeping change so it
does not muddy a behaviour diff.

## Out of scope — findings for separate issues

Turned up while verifying D10. Both are write-path bugs, not matching bugs:

- **Admins can write duplicate Kinship Links.** `public.links` has no unique constraint
  (`20260101_initial_schema.sql:30-38`), and `treeRecord.ts:270-295` POSTs straight to
  `/rest/v1/links` with no existence check. Non-admins are saved by
  `link_existing_relative_secure`, which returns `already_connected: true` instead of inserting.
  `adminGraphValidation.ts`'s `sameLinkEdge` exists to find these after the fact.
- **`already_connected` is read by nothing.** Typed at `database.ts:214`, and `treeRecord.addLink`
  returns `void`, so a non-admin clicking an already-linked candidate gets a spinner, a refetch,
  and no visible change. D10's marking hides this in the UI but does not fix it.

## Risks

- **D7 versus ADR-0001.** The Ghost Node exists because the modal interrupts; a hard block puts an
  interruption back on it. Mitigated by D3 (the guard now fires rarely) and by the disabled-button
  `title`. If it proves annoying in use, two-step Enter is the fallback and needs no module change.
- **D8 adds friction to a working path.** Only fires on exact given-name collisions during a rename.
- **Same-name relatives are common in this tree.** D3 will fire more often here than in a typical
  address book. That is the intent, but it is the thing to watch first.
